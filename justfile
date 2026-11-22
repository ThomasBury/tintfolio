# List available commands.
default:
    @just --list

# Install the dependencies from package-lock.json.
install:
    npm ci

# Run the development server with live reload.
serve $port="5173":
    npm run dev -- --host 127.0.0.1 --port "$port" --strictPort

# Build the production site into dist/.
build:
    npm run build

# Build and serve the production site on http://127.0.0.1:4173.
preview: build
    npm run preview -- --host 127.0.0.1 --port 4173 --strictPort

# Check TypeScript, unused code and whitespace in staged and unstaged diffs.
lint:
    npm run typecheck -- --noUnusedLocals --noUnusedParameters
    git diff --check
    git diff --cached --check

# Run unit tests.
test:
    npm test

# Install the Chromium version required by Playwright.
install-browser:
    npx playwright install chromium

# Build and run the browser tests.
test-browser: build
    npm run test:browser

# Run lint, unit tests, the production build and browser tests.
check: lint test test-browser

# Measure performance while `just preview` is running.
measure:
    npm run measure

# Remove generated build and browser test output.
clean:
    rm -rf -- dist playwright-report test-results

# Build for the given public URL and upload to an explicit Cloudflare Pages branch.
deploy $project $branch $url:
    @test -n "$project" && test -n "$branch" && test -n "$url" || { echo "Provide a Pages project, branch and public URL." >&2; exit 1; }
    @command -v wrangler >/dev/null || { echo "Install Wrangler and make it available on PATH." >&2; exit 1; }
    CF_PAGES_URL="$url" npm run build
    wrangler pages deploy dist --project-name="$project" --branch="$branch"
