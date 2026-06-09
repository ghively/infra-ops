# Remote, locked, ENCRYPTED state — never local, never committed. One state per env +
# per layer (blast-radius isolation). Replace with your backend (azurerm/gcs/http/TACO).
terraform {
  backend "s3" {
    bucket         = "REPLACE-tfstate-bucket"
    key            = "ENV/LAYER/terraform.tfstate"
    region         = "REPLACE-region"
    dynamodb_table = "REPLACE-tf-lock-table" # state locking
    encrypt        = true
  }
}
