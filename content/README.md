# Zanmi Lasante Content Package

This module defines the Zanmi Lasante (Haiti)-specific [OpenMRS Initializer](https://github.com/mekomsolutions/openmrs-module-initializer) configuration. At build time, the contents of `configuration/` are assembled into a zip artifact published as `org.pih.openmrs:zl-content`.

This content package is merged with the shared [PIH EMR content](https://github.com/PIH/openmrs-config-pihemr) (`org.pih.openmrs:pihemr-content`) when the distribution is built.

## Configuration Structure

Configuration files live under `configuration/`, split into two subdirectories:

| Directory | Purpose |
|---|---|
| `configuration/frontend_configuration/` | OpenMRS frontend (O3/SPA) configuration and branding (`config.json`, `zl-logo.png`, `pih-logo.png`) |
| `configuration/backend_configuration/` | Everything loaded by the OpenMRS Initializer module at startup |

`backend_configuration/` contains:

| Directory | Purpose |
|---|---|
| `addresshierarchy/` | Address hierarchy entries for Haiti |
| `appframework/` | App framework extension/dashboard definitions for the OpenMRS frontend (`mch_dashboard_app.json`, `overview_reports_extension.json`) |
| `drugs/` | Drug definitions |
| `globalproperties/` | OpenMRS global property overrides |
| `locations/` | Facility and location definitions |
| `locationtagmaps/` | Maps locations to location tags |
| `messageproperties/` | Localized (French) message overrides |
| `patientidentifiertypes/` | Patient identifier type definitions |
| `pih/` | PIH-specific configuration (site `pih-config-*.json` profiles, HTML forms, subforms, liquibase migrations, styles, logo, scripts, status data) |
| `programs/` | Program definitions |
| `programworkflows/` | Program workflow definitions |
| `programworkflowstates/` | Program workflow state definitions |
| `reports/` | Report descriptors |
| `roles/` | Role definitions |

## content.properties

`content.properties` provides the content package name and version (interpolated from the Maven project at build time), and defines key UUID/name constants used across the configuration:

| Property | Description |
|---|---|
| `var.patientIdentifierType.*` | UUIDs of Zanmi Lasante patient identifier types (national ID, CIN, dossier numbers, HIV-EMR legacy IDs, REDCap IDs) |
| `var.encounterType.*` | UUIDs/French names of Zanmi Lasante-specific and shared encounter types |
| `var.concept.*` | UUIDs of concepts referenced by Zanmi Lasante's MCH/vitals forms — most are defined in the parent `pihemr-content` and duplicated here because constants aren't shared across content packages |
| `var.expression.*` | Spring-EL boolean expressions (patient-age checks) used by `appframework/mch_dashboard_app.json` extension visibility rules |
| `var.privilege.app_coreapps_patient_dashboard` | Privilege name used by an `appframework/mch_dashboard_app.json` dashboard extension — defined in the parent `pihemr-content`, duplicated here for the same reason |
| `var.program.*`, `var.programWorkflow.*` | Program/program-workflow UUIDs — defined in the parent `pihemr-content`, duplicated here because this repo's configuration references them |
