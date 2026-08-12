# Zanmi Lasante Distribution

This module pulls together all component artifacts into a single deployable distribution using the [OpenMRS SDK Maven plugin](https://wiki.openmrs.org/display/docs/OpenMRS+SDK).

## How it works

Component versions are defined as Maven properties in `pom.xml`. During the Maven build (`mvn clean install`), these properties are interpolated into `openmrs-distro.properties`, which is packaged into the artifact jar and written to `target/classes/openmrs-distro.properties`. This resolved file is what `openmrs-sdk` and `openmrs-docker` pass to the SDK and Docker build steps.

## Updating component versions

To update a component version, change the corresponding property in `pom.xml` and rebuild:

```bash
mvn clean install
```

Then use `openmrs-sdk update` or `openmrs-docker start --build` to redeploy with the new versions.

## Release

Releases follow semantic versioning. To publish a release, run:

```bash
mvn clean deploy -U -DdeployRelease -Dgpg.passphrase=*** -Dgpg.keyname=<email>
```

This signs the artifacts with GPG and publishes to Maven Central via Sonatype. See the `release` profile in `pom.xml` for configuration details.

## Overriding parent content values

`openmrs-distro.properties` can carry `var.*` entries of its own, separate from any content package's `content.properties`. The difference matters: a content package's `content.properties` only resolves `${...}` placeholders within files that ship in that same package, so it can't be used to override a value in a *different* (e.g. parent) content package's files. `var.*` entries in this distro-level `openmrs-distro.properties`, by contrast, are applied by the `openmrs-sdk-maven-plugin`'s `build-distro` goal across the fully merged configuration tree, after all content packages are layered together — so they can override values in any package, including the parent's. This repo uses that mechanism for the four `var.encounterType.*.name` entries, which override the parent `pihemr-content` package's own English encounter-type names with zl's French ones.

**Non-ASCII values require a patched `openmrs-sdk-maven-plugin`.** Plugin versions prior to the fix in [openmrs/openmrs-sdk branch SDK-403](https://github.com/openmrs/openmrs-sdk) read this file as ISO-8859-1, so a literal accented character (e.g. a UTF-8 `é`) comes out double-encoded (mojibake) in the assembled configuration. That fix makes `build-distro` read properties files as UTF-8, so plain text like `Médicaments administrés` now round-trips correctly — no `\uXXXX` escaping needed. Verified by rebuilding this module (with the patched plugin installed locally) and inspecting the assembled `encounterTypes.csv` at the byte level.
