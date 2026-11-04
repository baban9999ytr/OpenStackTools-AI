# Source and asset provenance

This repository was initialized as a new, empty Git repository for OpenStackTools AI. Application source, UI, CSS, API routes, tests, and documentation were authored from the product requirements in the project request. The previously evaluated MERN tutorial repository was not accessed or used as implementation input for this project. No tutorial code, third-party logos, illustrations, prompts, or proprietary design assets were copied. The UI uses CSS shapes and text only.

External code consists of npm dependencies declared in `apps/api/package.json` and `apps/web/package.json`, plus transitive dependencies locked in `package-lock.json`. Their declared licenses and bundled notices are inventoried in `THIRD_PARTY_LICENSES.md`. The inventory is not proof that the entire project is free of obligations. License texts are reproduced only to preserve required notices. API service terms for OpenAI and any future messaging channels are separate from software package licenses and must be reviewed before commercial use.

No first-party license grant has been chosen for this repository. The founder should choose and document ownership, contributor terms, and the intended distribution/license model before accepting external contributions or selling the software.

## Database server and API service terms

The Compose environment uses the official MongoDB Community Server image. MongoDB states Community Server is under the SSPL, which is **not OSI-approved**. Its [licensing FAQ](https://www.mongodb.com/legal/licensing/server-side-public-license/faq) says Section 13 applies to offering MongoDB itself as a service and distinguishes other SaaS applications that use MongoDB as a database. This project is an assistant application, but the exact commercial deployment and distribution model should be reviewed by counsel. The Mongoose npm package license is a separate matter. Review [OpenAI's business and developer terms](https://openai.com/policies/) before customer launch; package licensing does not govern API service usage.
