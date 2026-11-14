# Third-party notices

Clearroom's original source is licensed under the [MIT License](LICENSE), copyright © 2026 Clearroom contributors. That license does **not** replace the licenses of dependencies, model weights, fonts, icons, or vendored source. Their original copyright and license notices remain applicable.

This inventory was prepared on **15 November 2026**. It records publisher metadata and preserves the license/notice files available in the installed packages. It is not a claim that every dependency or container-image redistribution requirement has been independently audited.

## Dependency inventories and preserved texts

| Inventory | Coverage | Files |
| --- | --- | --- |
| JavaScript | All 895 dependency entries in `package-lock.json`, including development, transitive, and platform-optional packages; 687 are installed in the captured checkout | [Readable inventory](licenses/npm-inventory.md) · [JSON](licenses/npm-inventory.json) |
| Python | 41 distributions in the deployed Brev API container, plus 17 in the local test environment | [Readable inventory](licenses/python-inventory.md) · [JSON](licenses/python-inventory.json) |
| Original publisher notices | Available LICENSE, COPYING, NOTICE, and README license sections, including notices for bundled code | [Preserved text directory](licenses/texts/) |

The text files are named by SHA-256 so identical notices can be shared without altering their contents. Each inventory entry links its corresponding files and records the original package path. Development dependencies are included for transparency; their presence does not imply they are shipped in the browser bundle.

## Models, voice, fonts, and vendored components

| Component | License / attribution | Original source or preserved notice |
| --- | --- | --- |
| Qwen3 14B, served as `qwen3:14b-q4_K_M` | Apache License 2.0 | [Deployed model license](licenses/Qwen3-14B-LICENSE.txt) · [Official model license](https://huggingface.co/Qwen/Qwen3-14B/blob/main/LICENSE) · [Official GGUF model](https://huggingface.co/Qwen/Qwen3-14B-GGUF) |
| Cached Qwen3 tokenizer | Apache License 2.0; the backend pins the Qwen3-8B tokenizer revision | [Pinned tokenizer source and license](https://huggingface.co/Qwen/Qwen3-8B/tree/47719a242beab8f9aecc40ce3928b034dd5dd559) |
| Ollama runtime | MIT | [Official license](https://github.com/ollama/ollama/blob/main/LICENSE) |
| Whisper / Whisper-small model | MIT, OpenAI | [Official Whisper license](https://github.com/openai/whisper/blob/main/LICENSE) |
| Faster-Whisper and converted small model | MIT; SYSTRAN conversion of OpenAI Whisper | [Library license](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE) · [Converted model card](https://huggingface.co/Systran/faster-whisper-small) · library notice in the Python inventory |
| DM Sans | SIL Open Font License 1.1 | [Copyright and OFL text](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt) |
| Manrope | SIL Open Font License 1.1 | [Copyright and OFL text](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt) |
| Lucide React icons | ISC; its Feather-derived icons also carry the included MIT notice for Cole Bemis | `lucide-react` entry in the [npm inventory](licenses/npm-inventory.md), preserving both notices |
| shadcn-derived UI source | MIT, copyright © 2023 shadcn | [Vendored notice](vendor/shadcn-tailwind-4.13.0.LICENSE.md) |
| Sites Vite integration source | MIT, copyright © 2026 OpenAI | [Vendored notice](scripts/vite/sites-vite-plugin.LICENSE) |
| Cloudflare tunnel binary | Apache License 2.0 | [Official cloudflared license](https://github.com/cloudflare/cloudflared/blob/master/LICENSE) |
| Python interpreter | Python Software Foundation license and historical notices | [CPython 3.11 license](https://github.com/python/cpython/blob/3.11/LICENSE) |

The fonts are requested through Google Fonts; their binary files are not committed to this repository. The Whisper and Qwen weights are downloaded by the backend, not distributed inside this source tree. Browser speech voices are supplied by the user's browser/operating system and are not Clearroom assets.

Clearroom's original SVG artwork and code-generated interface sounds are part of the project source. Duolingo is referenced as a learning-design inspiration; its lesson content, characters, logos, and audio assets are not included. Third-party names do not imply endorsement or grant trademark rights.

## Coverage limits that remain visible

- **Platform-specific packages:** 208 lockfile entries were not installed in the captured macOS checkout. Their declared licenses and artifact URLs are recorded; their actual target-platform notice files must be inspected when distributing those artifacts.
- **Installed package gaps:** 35 installed npm packages did not ship a separate notice file or a detected README license section. Their declared licenses and repository/artifact references remain in the inventory. Absence of a bundled notice does not mean absence of a license obligation.
- **Version mismatch:** the checkout contained `@emnapi/wasi-threads` 1.2.1 while the lockfile requested 1.2.3. Its entry explicitly distinguishes the installed notice source from the locked version. Regenerate after a clean lockfile installation.
- **Python wheel gaps:** the captured CTranslate2, FlatBuffers, and Tokenizers distributions did not expose separate license files through their installed wheel metadata. Their declarations are recorded. Consult [CTranslate2](https://github.com/OpenNMT/CTranslate2/blob/master/LICENSE), [FlatBuffers](https://github.com/google/flatbuffers/blob/master/LICENSE.txt), and [Tokenizers](https://github.com/huggingface/tokenizers/blob/main/LICENSE) when redistributing them.
- **External license texts:** the table above links authoritative font/model/runtime license sources. Except for the captured Qwen license and installed-package texts, those external texts have not been downloaded into this repository. [The source list](licenses/upstream-sources.json) records the intended retrieval URLs and their current fetch status.
- **Images and native components:** this is an application/package inventory, not a complete Debian, CUDA, NVIDIA driver, FFmpeg, or Docker-image bill of materials. For native bundles, preserve their additional notices and source/relinking requirements as applicable. For example, the `sharp-libvips` README notice lists multiple component licenses; its LGPL declaration is not an MIT license.

## Refreshing the notices

The generator uses only local files unless `--fetch-upstream` is explicitly supplied. It does not change installed dependencies or infer missing license text from a generic template.

```sh
# Capture the Python environment you actually ship.
python3 scripts/generate-licenses.py --collect-python > licenses/python-runtime-source.json

# Rebuild inventories from the lockfile, installed npm packages, and snapshots.
python3 scripts/generate-licenses.py \
  --python-snapshot licenses/python-local-source.json \
  --python-snapshot licenses/python-runtime-source.json
```

For the existing Brev deployment, `licenses/capture-runtime-python.sh` captures public package metadata and license files without reading application secrets or invoking inference. Copy the resulting snapshot back before running the generator. Review notices again when versions, models, fonts, native binaries, or deployment images change.
