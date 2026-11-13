# Licence review (LTB v1.0)

Done before building the dataset and before any paid call. **Outcome: no third-party corpus text is used.** Every case is original synthetic content written for this benchmark.

## Candidate sources reviewed

| Source | What it is | Licence found | Commercial use | Decision |
|---|---|---|---|---|
| CEFR-SP (SCoRE subset), Arase, Uchida and Kajiwara, EMNLP 2022 ([paper](https://aclanthology.org/2022.emnlp-main.416/), DOI 10.18653/v1/2022.emnlp-main.416) | 17k English sentences with CEFR levels assigned by professionals | CC BY-NC-SA 4.0 | No (non-commercial) | Excluded |
| CEFR-SP, Hugging Face copy (`cefr_sp_en`) | The same data, mirrored | CC BY-NC-SA 4.0 | No | Excluded |
| CEFR-SP, Wiki-Auto subset | Wikipedia-derived sentences | CC BY-SA 3.0 (share-alike); upstream terms not fully traced | Allowed with share-alike obligations | Not used: share-alike risk and an unverified chain |
| CEFR-SP, Newsela subset | News sentences | Gated by the Newsela licence agreement | Requires an agreement | Excluded |
| UniversalCEFR, EMNLP 2025 ([paper](https://aclanthology.org/2025.emnlp-main.491/)) | A collection of CEFR-labelled datasets | The MIT licence covers the directory repo only; component datasets carry their own terms, many non-commercial research only | Varies; often no | Excluded |
| icle500 | Learner essays | Terms unclear | Unclear | Excluded |

## What was used instead

- 120 cases, all original text written for ENARA (`provenance` block on every case). ENARA's internal licence covers them.
- CEFR labels on cases are author-assigned against published CEFR level descriptions. They're marked `provisional` and are not expert-validated.
- The corpora above are cited only as references for level descriptions. No corpus sentence, label or annotation is copied into a case, a prompt or a paid call.

## Personal data

None. Learner profiles are invented. There are no 4Level1 records, no school records, no audio and no names of real people. Synthetic names exist only to test that identifiers don't reach the provider.
