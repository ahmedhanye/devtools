# Changelog

## 0.1.0 (2026-11-11)


### ⚠ BREAKING CHANGES

* **deps:** Disables CSS and IFrame loading by default (<a href="https://redirect.github.com/capricorn86/happy-dom/issues/2502">#2502</a>)</li> <li><a href="https://github.com/capricorn86/happy-dom/commit/f21dbd7d0a0c63cdd41954ba5d0f05def4e0f2b3"><code>f21dbd7</code></a> fix: Fixes cookie scope forgery vulnerability (<a href="https://redirect.github.com/capricorn86/happy-dom/issues/2477">#2477</a>)</li> <li>See full diff in <a href="https://github.com/capricorn86/happy-dom/compare/v20.14.5...v21.0.1">compare view</a></li> </ul> </details> <br />

### Features

* **agents:** evolve agent skills, automate review workflows, and streamline contributing governance ([#81](https://github.com/ahmedhanye/devtools/issues/81)) ([75ca841](https://github.com/ahmedhanye/devtools/commit/75ca8412a7a846b85800291dbe1573c904fc7913))
* **api:** add lighthouse daemon audit routes, SSE stream, and shutdown ([#128](https://github.com/ahmedhanye/devtools/issues/128)) ([ed7da75](https://github.com/ahmedhanye/devtools/commit/ed7da75ff4608ba2be33d7f64ec2f820dd5b0430))
* **apps:** enforce loopback security and partition api and cli test suites ([#105](https://github.com/ahmedhanye/devtools/issues/105)) ([0a00604](https://github.com/ahmedhanye/devtools/commit/0a00604604f8f8c84194ddc8fdf21019f22aa133))
* **browser:** implement browser provisioning and waterfall resolution ([#55](https://github.com/ahmedhanye/devtools/issues/55)) ([1736f85](https://github.com/ahmedhanye/devtools/commit/1736f8573882e8b5c878b4a5e52febd62345bb33))
* **cli:** add lighthouse audit commands and agent output mode ([#110](https://github.com/ahmedhanye/devtools/issues/110)) ([28aaf7b](https://github.com/ahmedhanye/devtools/commit/28aaf7b3b5d68d1d3595fd2ae12a1543dcd16dce))
* **frontend,site:** execute storybook stories in vitest and elevate linter gates ([#92](https://github.com/ahmedhanye/devtools/issues/92)) ([1330f04](https://github.com/ahmedhanye/devtools/commit/1330f04b642592f281c853cf078fba6aa7a9daef))
* **frontend:** add interactive stories, strict mermaid security, and test scripts ([#106](https://github.com/ahmedhanye/devtools/issues/106)) ([358bc14](https://github.com/ahmedhanye/devtools/commit/358bc14ca8aeefd9ca9f3c41384d5de418ed1ec9))
* **frontend:** establish sidebar layout and dashboard empty state ([#41](https://github.com/ahmedhanye/devtools/issues/41)) ([180c14a](https://github.com/ahmedhanye/devtools/commit/180c14a7e35ea58dc54ef9b735bf47b93081d0f9))
* **lighthouse:** add audit schemas, shared diffing, and batch runner ([#127](https://github.com/ahmedhanye/devtools/issues/127)) ([7cd9dcb](https://github.com/ahmedhanye/devtools/commit/7cd9dcb1d51af3ffac9d29718190a8b9ca19be9e))
* **lighthouse:** add core audit engine and persistence foundation ([#96](https://github.com/ahmedhanye/devtools/issues/96)) ([c91eda2](https://github.com/ahmedhanye/devtools/commit/c91eda2037686a49a9d663df8162a95d1fdd807b))
* **packages:** isolate runtime seams and partition package test suites ([#104](https://github.com/ahmedhanye/devtools/issues/104)) ([fbc2a24](https://github.com/ahmedhanye/devtools/commit/fbc2a24993a3b61c510eff98aa7c8edcf1f480f3))
* **runtime:** establish core interconnected runtime stack ([#12](https://github.com/ahmedhanye/devtools/issues/12)) ([31adf74](https://github.com/ahmedhanye/devtools/commit/31adf74af7f50ae26dfd6a27effa9c9ecd69cbc2))
* **runtime:** modernize package seams, database lifecycle, and security middleware ([#91](https://github.com/ahmedhanye/devtools/issues/91)) ([8dbe423](https://github.com/ahmedhanye/devtools/commit/8dbe423c7994f458729ec3625f8f609ac1979a3c))


### Bug Fixes

* **ci:** harden secret scanning with native binary and consolidate dependabot configuration ([#85](https://github.com/ahmedhanye/devtools/issues/85)) ([8a759b6](https://github.com/ahmedhanye/devtools/commit/8a759b65989b60883b640481fa79f3647c56c1b6))
* **cli:** resolve non-tty formatting and progress reporting ([#121](https://github.com/ahmedhanye/devtools/issues/121)) ([aeb78a0](https://github.com/ahmedhanye/devtools/commit/aeb78a034e89360ec89af06388e4fd0f0d08affa))
* **db:** embed drizzle migrations and add core error codes ([#126](https://github.com/ahmedhanye/devtools/issues/126)) ([143c0c8](https://github.com/ahmedhanye/devtools/commit/143c0c8292b12bc452be2944c18873a0f73e85c5))
* **lighthouse:** resolve virtual fs locales and error handling ([#120](https://github.com/ahmedhanye/devtools/issues/120)) ([2095cdb](https://github.com/ahmedhanye/devtools/commit/2095cdb93f82c53926c88da2d1553cb5888dac5d))
* **security:** exclude false-positive vendor doc path from TruffleHog secret scanning ([e46f7a7](https://github.com/ahmedhanye/devtools/commit/e46f7a78ddb1a335cfc547f7645a7a1b151ea49e))
* **tooling:** improve linters and local-to-ci verification parity ([#65](https://github.com/ahmedhanye/devtools/issues/65)) ([0223bdf](https://github.com/ahmedhanye/devtools/commit/0223bdf7629e1f28d260c2a6caf6843628dce9a9))
* **tooling:** resolve audit vulnerability in vite, prevent fallow gitignore churn, and expand dependabot coverage ([#71](https://github.com/ahmedhanye/devtools/issues/71)) ([3becfe9](https://github.com/ahmedhanye/devtools/commit/3becfe97c132ad51ca26af22ce4b297ab7fb23a9))
* **tooling:** retire pre-push audit gate, upgrade dompurify, and tune dependabot cadence ([#77](https://github.com/ahmedhanye/devtools/issues/77)) ([1282804](https://github.com/ahmedhanye/devtools/commit/12828047082fb3d3933eb0ba236bf0ae0f6c1f05))


### Miscellaneous Chores

* **deps:** bump happy-dom from 20.14.5 to 21.0.1 ([#64](https://github.com/ahmedhanye/devtools/issues/64)) ([00cece7](https://github.com/ahmedhanye/devtools/commit/00cece7e5b47313dd147198b7fa2c886303f0e90))
