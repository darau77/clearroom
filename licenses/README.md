# License inventory files

Start with [Third-party notices](../THIRD_PARTY_NOTICES.md) for scope, attributions, known gaps, and regeneration commands.

- [`npm-inventory.md`](npm-inventory.md) / [`npm-inventory.json`](npm-inventory.json): every locked npm dependency, with installed versions and preserved notices.
- [`python-inventory.md`](python-inventory.md) / [`python-inventory.json`](python-inventory.json): the deployed API container and local test environment.
- [`texts/`](texts/): unmodified publisher notices, deduplicated by content hash.
- [`Qwen3-14B-LICENSE.txt`](Qwen3-14B-LICENSE.txt): the license returned by the deployed Ollama model.
- [`python-runtime-source.json`](python-runtime-source.json) and [`python-local-source.json`](python-local-source.json): input snapshots containing public package metadata and license text, not environment variables or application data.
- [`upstream-sources.json`](upstream-sources.json): authoritative external license URLs; fetch errors are kept explicit rather than replaced with guessed text.

Generated inventory files record package metadata; they do not relicense dependencies. The original project license is [`../LICENSE`](../LICENSE).
