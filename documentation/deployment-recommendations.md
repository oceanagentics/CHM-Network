# Deployment Review & Friction Reduction Plan

Based on a review of `cloudbuild.yaml`, `cloudbuild.release.yaml`, and `documentation/cloud-run-migration.md`, deployments currently feel high-friction because developers are required to manually execute and monitor multi-line `gcloud builds submit` and `gcloud run deploy` commands locally. 

To eliminate deployment friction and enforce a strict GitOps workflow, we recommend replacing manual deployment commands with a fully automated Continuous Deployment (CD) pipeline.

## Proposed Best Practices

### 1. Continuous Deployment Pipeline (GitHub Actions)

Deployments should happen automatically when code is reviewed and merged, completely removing the need for local deployments.

**Action: Set up GitHub Actions (`.github/workflows/deploy.yml`)**
- **Trigger:** Automatically run the workflow on pushes or pull request merges to the `main` branch.
- **Execution:** The GitHub Action will take over the job of running `gcloud builds submit` and `gcloud run deploy`. This delegates the heavy lifting back to Cloud Build, ensuring that your existing layer-caching optimizations (which brought build times down to ~49s) are fully preserved.
- **Security:** Authenticate GitHub to Google Cloud securely using Workload Identity Federation (keyless authentication) instead of long-lived static service account keys.
- **Result:** Developers merge code in GitHub, and the three Explorer services (`public`, `admin`, and `api`) update automatically with zero manual terminal commands.

### 2. Terraform Lifecycle Alignment (Infrastructure)

The current documentation correctly notes: *"If a fast deploy causes Terraform to report image drift later, do not roll the app image back just to satisfy Terraform."*

**Action: Ignore Image Drift in Terraform**
To formalize this, ensure the `google_cloud_run_v2_service` resources in your shared CHM infrastructure Terraform contain the following lifecycle block:

```hcl
lifecycle {
  ignore_changes = [
    template[0].containers[0].image,
  ]
}
```

This explicitly tells Terraform to manage the core infrastructure (networking, secrets, environment variables), while allowing your automated GitHub Actions pipeline to manage the container image revisions without fighting each other during a `terraform apply`.
