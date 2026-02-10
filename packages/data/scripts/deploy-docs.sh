#!/bin/bash

# Exit if any command fails
set -e

# Step 1: Ensure we are on the main branch
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
  echo "Error: You are on branch '$current_branch'. Please switch to 'main' before deploying."
  exit 1
fi

# Step 2: Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo "Error: You have uncommitted changes. Please commit or stash your changes before deploying."
  exit 1
fi

# Step 3: Build the project
echo "Building the project..."
pnpm install
pnpm run build

# Step 4: Checkout gh-pages branch
echo "Checking out the gh-pages branch..."
git fetch origin
git checkout gh-pages
git pull origin gh-pages

# Step 5: Commit and push the changes to gh-pages
echo "Committing and pushing changes to gh-pages..."
git checkout -f main -- README.md docs
git add dist/ docs/ README.md
git commit -m "Deploy updated docs and dist to GitHub Pages"
git push origin gh-pages

# Step 6: Switch back to the main branch
echo "Switching back to the main branch..."
git checkout main

echo "Deployment to gh-pages complete!"
