# Module logic. Keep it reusable: no provider/backend config here (that lives in the
# root/env module). No hardcoded secrets — pass them as sensitive variables.
resource "null_resource" "placeholder" {
  triggers = {
    name = var.name
  }
}
