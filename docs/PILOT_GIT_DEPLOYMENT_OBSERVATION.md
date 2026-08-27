# Git deployment observation

After merge, Pilot observes the exact merge commit through GitHub's combined-status feed and extracts the Vercel status. A command reaches COMPLETED only when both the Vercel Git deployment is successful and production verification reports the exact merged revision. This avoids the blocked Vercel REST/PAT path and exposes deployment_observation directly to Pilot.