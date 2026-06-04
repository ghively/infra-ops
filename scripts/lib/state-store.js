#!/usr/bin/env node
/**
 * Infra-Ops State Store Library
 *
 * Provides CRUD operations for the State Store collections.
 * Collections: sessions, skillRuns, skillVersions, decisions, installState,
 *             governanceEvents, workItems, knowledgeBase, observations
 *
 * Storage: JSON files under STATE_DIR (default: ~/.infra-ops/state-store/)
 * Each collection is a separate JSON file for atomic updates.
 *
 * Usage:
 *   const StateStore = require('./lib/state-store.js');
 *   await StateStore.governanceEvents.add({ ...event });
 *   const events = await StateStore.governanceEvents.getAll();
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// State directory defaults to ~/.infra-ops/state-store/
const DEFAULT_STATE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.infra-ops',
  'state-store'
);

const STATE_DIR = process.env.INFRA_OPS_STATE_DIR || DEFAULT_STATE_DIR;

// Collection file names
const COLLECTION_FILES = {
  sessions: 'sessions.json',
  skillRuns: 'skill-runs.json',
  skillVersions: 'skill-versions.json',
  decisions: 'decisions.json',
  installState: 'install-state.json',
  governanceEvents: 'governance-events.json',
  workItems: 'work-items.json',
  knowledgeBase: 'knowledge-base.json',
  observations: 'observations.json'
};

// Maximum entries per collection before pruning
const MAX_ENTRIES_PER_COLLECTION = 1000;

// TTL for entries (30 days in milliseconds)
const ENTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Generate a unique ID for a collection entry.
 */
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Ensure the state directory exists.
 */
function ensureStateDir() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Get the file path for a collection.
 */
function getCollectionPath(collectionName) {
  const fileName = COLLECTION_FILES[collectionName];
  if (!fileName) {
    throw new Error(`Unknown collection: ${collectionName}`);
  }
  return path.join(STATE_DIR, fileName);
}

/**
 * Read a collection from disk.
 */
function readCollection(collectionName) {
  const collectionPath = getCollectionPath(collectionName);
  try {
    if (fs.existsSync(collectionPath)) {
      const data = fs.readFileSync(collectionPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error reading collection ${collectionName}:`, error.message);
  }
  return [];
}

/**
 * Write a collection to disk (atomic).
 */
function writeCollection(collectionName, data) {
  ensureStateDir();
  const collectionPath = getCollectionPath(collectionName);
  const tmpPath = `${collectionPath}.tmp.${process.pid}`;

  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, collectionPath);
    return true;
  } catch (error) {
    // Clean up temp file on error
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (_) {
      /* ignore */
    }
    throw error;
  }
}

/**
 * Prune old entries from a collection based on TTL and max count.
 */
function pruneCollection(collectionName, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return entries;
  }

  const now = Date.now();
  const pruned = entries.filter(entry => {
    // Keep entries that are newer than TTL
    const createdAt = entry.createdAt || entry.created_at || 0;
    return (now - createdAt) < ENTRY_TTL_MS;
  });

  // If still over max count, keep the most recent entries
  if (pruned.length > MAX_ENTRIES_PER_COLLECTION) {
    // Sort by createdAt descending and keep the newest entries
    pruned.sort((a, b) => {
      const timeA = a.createdAt || a.created_at || 0;
      const timeB = b.createdAt || b.created_at || 0;
      return timeB - timeA;
    });
    pruned.splice(MAX_ENTRIES_PER_COLLECTION);
  }

  return pruned;
}

/**
 * Create a collection proxy with CRUD operations.
 */
function createCollectionProxy(collectionName) {
  return {
    /**
     * Add a new entry to the collection.
     */
    async add(entry) {
      const entries = readCollection(collectionName);

      // Ensure ID exists
      if (!entry.id) {
        entry.id = generateId(collectionName.slice(0, -1)); // singular prefix
      }

      // Add createdAt if missing
      if (!entry.createdAt) {
        entry.createdAt = new Date().toISOString();
      }

      entries.push(entry);
      const pruned = pruneCollection(collectionName, entries);
      writeCollection(collectionName, pruned);
      return entry;
    },

    /**
     * Get all entries from the collection.
     */
    async getAll() {
      return readCollection(collectionName);
    },

    /**
     * Get an entry by ID.
     */
    async getById(id) {
      const entries = readCollection(collectionName);
      return entries.find(entry => entry.id === id) || null;
    },

    /**
     * Update an entry by ID.
     */
    async update(id, updates) {
      const entries = readCollection(collectionName);
      const index = entries.findIndex(entry => entry.id === id);

      if (index === -1) {
        return null;
      }

      // Merge updates
      entries[index] = {
        ...entries[index],
        ...updates,
        id, // Preserve ID
        updatedAt: new Date().toISOString()
      };

      writeCollection(collectionName, entries);
      return entries[index];
    },

    /**
     * Delete an entry by ID.
     */
    async delete(id) {
      const entries = readCollection(collectionName);
      const filtered = entries.filter(entry => entry.id !== id);

      if (filtered.length === entries.length) {
        return false; // Not found
      }

      writeCollection(collectionName, filtered);
      return true;
    },

    /**
     * Query entries with a filter function.
     */
    async query(filterFn) {
      const entries = readCollection(collectionName);
      return entries.filter(filterFn);
    },

    /**
     * Clear all entries from the collection.
     */
    async clear() {
      writeCollection(collectionName, []);
    },

    /**
     * Get the count of entries.
     */
    async count() {
      const entries = readCollection(collectionName);
      return entries.length;
    }
  };
}

// Create collection proxies for all collections
const StateStore = {
  sessions: createCollectionProxy('sessions'),
  skillRuns: createCollectionProxy('skillRuns'),
  skillVersions: createCollectionProxy('skillVersions'),
  decisions: createCollectionProxy('decisions'),
  installState: createCollectionProxy('installState'),
  governanceEvents: createCollectionProxy('governanceEvents'),
  workItems: createCollectionProxy('workItems'),
  knowledgeBase: createCollectionProxy('knowledgeBase'),
  observations: createCollectionProxy('observations'),

  // Utility functions
  generateId,
  ensureStateDir,
  getCollectionPath,

  /**
   * Get statistics about all collections.
   */
  async getStats() {
    const stats = {};
    for (const collectionName of Object.keys(COLLECTION_FILES)) {
      const entries = readCollection(collectionName);
      stats[collectionName] = {
        count: entries.length,
        sizeBytes: JSON.stringify(entries).length
      };
    }
    return stats;
  },

  /**
   * Initialize the state store (ensure directory exists).
   */
  async init() {
    ensureStateDir();
  }
};

module.exports = StateStore;
