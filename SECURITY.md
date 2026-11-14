# Security

Keep service credentials in the deployment provider's secret store or private environment. Never commit a real `.env` file, private key, database password, API token, or an exported workflow containing one. Example files must contain placeholders only.

The Repository security workflow scans the current tracked source with Gitleaks. Each finding is redacted; the only scanner exceptions are exact reviewed synthetic values restricted to their fixture paths. Historical commits and deployed configurations need separate review. A clean source scan does not prove a deployed service or account is secure.

If a credential was ever committed, revoke or rotate it at its provider and update every deployment and automation using it. Deleting the current value does not revoke access or erase existing Git history, forks, caches, or clones. Avoid posting credential values in issues, logs, or pull requests.

Weekly Dependabot checks cover supported dependency manifests and GitHub Actions. Dependency audits use the advisory data available when they run. Review and test proposed updates before merging them.

Report suspected vulnerabilities privately using GitHub's private vulnerability reporting when available, or contact the repository owner privately. Include affected paths and a minimal redacted reproduction; do not publish live credentials or personal records.
