# Root/env module: wires providers + calls reusable modules. Plan on MR, apply on a
# protected branch after human approval — never auto-apply (propose, never dispose).
provider "null" {}

module "example" {
  source = "../../modules/example"
  name   = var.name
  tags   = var.tags
}

variable "name" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
