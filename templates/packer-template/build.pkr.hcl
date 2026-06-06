# Canonical Packer build. Bake an immutable image; deploy it with Terraform/OpenTofu.
packer {
  required_plugins {
    amazon = {
      version = ">= 1.3.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

source "amazon-ebs" "base" {
  ami_name      = "${var.image_name}-{{timestamp}}"
  instance_type = var.instance_type
  region        = var.region
}

build {
  name    = var.image_name
  sources = ["source.amazon-ebs.base"]

  # Configure the image with Ansible (provision the inside of the host).
  provisioner "ansible" {
    playbook_file = "../../playbooks/site.yml"
  }
}
