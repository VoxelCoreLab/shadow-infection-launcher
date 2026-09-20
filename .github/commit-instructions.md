Always use Conventional Commits.

Format:
type(scope): description

Choose the most appropriate type:

* feat: A new feature or functionality visible to users or other developers.
  Examples: add login system, add new API endpoint, add inventory screen.

* fix: A bug fix that corrects incorrect or broken behaviour.
  Examples: fix null reference exception, fix incorrect damage calculation.

* docs: Documentation-only changes.
  Examples: update README, add API documentation, improve code comments.

* style: Changes that do not affect behaviour or logic.
  Examples: formatting, whitespace, lint fixes, import ordering.

* refactor: Code restructuring without changing external behaviour.
  Examples: extract methods, rename classes, reorganize architecture.

* test: Adding, updating, or fixing tests.
  Examples: add unit tests, update integration tests, improve test coverage.

* chore: Maintenance tasks that do not affect application behaviour.
  Examples: update dependencies, clean up scripts, update configuration files.

* ci: Changes to CI/CD pipelines, automation, or workflows.
  Examples: update GitHub Actions, modify deployment pipeline.

* build: Changes to build systems, packaging, bundling, or tooling.
  Examples: update Vite configuration, modify webpack settings, change Docker build process.

* perf: Performance improvements without changing functionality.
  Examples: optimize database queries, reduce memory allocations, improve rendering performance.

Rules:

* Use lowercase for the type.
* Use imperative mood in the description.
* Keep the subject line under 72 characters.
* Do not end the subject line with a period.
* Use a scope when it adds useful context.
* Only add a body when it explains why the change was made.
* If a change fits multiple types, prefer the most user-visible impact:
  feat > fix > perf > refactor > docs > style > chore.
* For commits containing multiple unrelated changes, choose the type that best represents the primary purpose of the commit.