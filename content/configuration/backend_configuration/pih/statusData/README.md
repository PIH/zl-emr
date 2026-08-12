Status Data Definitions
============================

Status Data Definitions are a construct that can be authored to calculate derived data for a patient, typically for 
display on a patient summary.  The original use case for Status Data Definitions was to support a configurable
dashboard widget that would show key data points for a patient within a patient summary, though it is expected to 
find expanded uses throughout the application.

## Defining a Status Data Configuration File

A status data configuration file contains a collection of status data definitions that are intended to be evaluated and used
together.  The primary example is that of defining and displaying a status widget as described in the section below.

Status data files are defined in the `configuration/pih/statusData` directory as .yml files.  These files refer to
SQL files that provide the necessary data to evaluate.  These SQL file paths are relative to the .yml file that
references them.  The directories/subdirectories in which .yml and .sql files are defined is fully flexible within the
statusData parent directory.

The format of a status data file is as a list of status data definitions.  Each status data definition is defined in the
yaml file by starting the first element with a dash, and then ensuring all related properties are indented underneath the 
first property as follows.  You can have as many definitions as you want in the same file that follow this syntax, and
they will be evaluated (and displayed) in the order defined.

```yaml
- id: "aUniqueIdThatMayBeUsedToReferenceThisSpecificDefinition"
  labelCode: "a.message.code.for.the.label.to.associate.with.the.data"
  statusDataQuery: "aLinkToARelativeSqlFileThatDefinesTheDataToEvaluate.sql" # note, if your SQL is very short, you could also put the raw sql query here
  conditionExpression: "An optional expression if needed to indicate when this condition may not be enabled"
  valueExpression: "A velocity expression that defines the text that you want to display for this status."
  formatExpression: "An optional velocity expression that defines the format that you want to display for this status" # For display, typically maps to css class
```

#### id
The id is a unique code that can be used to identify this specific definition.
One should be able to identify a specific status data definition by the path to the file + the definition id within the file

#### labelCode
This refers to a message code, which is the label associated with the status data element

### statusDataQuery
This defines the data that is used by the statusData definition.  If the value here ends with ".sql", then the
framework will assume that it should load a .sql file at the path specified by this value.  This path is relative to the
yml definition file, so any file in the same directory can be included just by specifying the sql filename.  If the sql
is very concise and limited, it can be specified in-line as a sql select statement.

The SQL itself it intended to be executed for a single patient.  The framework makes a `@patientId` variable available
that it intends all queries to use.  So, a query to retrieve a patient's birthdate and gender should read like this:

```sql
select birthdate, gender from person where person_id = @patientId;
```

All the selected results are made available in the Velocity context inside a variable named `$data`.  In most cases,
it is expected that queries will return a single row of data, in which case the results of the query are also made
available in the Velocity context as variables that match the selected column names.  So for the query above, there
would be two additional variables named `$birthdate` and `$gender` in the Velocity context.  In the rare event that
a query returns multiple rows of data, these will need to be manipulated through the data variable.  For example, 
one could determine the number of rows returned via `$data.size()` and retrieve the first row via `$data.get(0)`

### conditionExpression
This is an optional Velocity expression which, if it evaluates to "false" or "0" will indicate that the statusData is
not enabled for a given patient.

### valueExpression
This is a required Velocity expression that defines the display _value_ for the statusData returned.

### formatExpression
This is an optional Velocity expression that defines the display _format_ for the statusData returned.
Within the context of the statusData widget, this value maps to the CSS class of the value itself.
CSS classes can be defined as needed to match the formats defined here in the `configuration/pih/styles/global/xxx.css` files.

## Velocity Expressions
Velocity is a templating language that is used to evaluate to some text given a context of variables and utility functions.

#### Variables
The velocity context is populated with data into variables from the defined `statusDataQuery`.  As described above,
data values can be accessed in a velocity expression by prefixing their names with a `$`.  eg. `$gender`

#### Functions
The velocity context is also populated with a library of utility functions.  These can be expanded easily to meet new needs 
as they arise, and should be requested/added as demand arises.  The current set of functions available in the context are these:

* $locale() - returns the current user locale
* $translate('message.code') - returns the translation for the given message.code
* $format($obj) - formats the passed $obj variable
* $formatDate($dateObj, 'formatStr') - formats the passed $dateObj variable using the given format
* $now() - returns the current datetime
* $startOfToday() - returns the current date at midnight
* $startOfDay($dateObj) - returns the passed $dateObj with the time set to midnight
* $yearsSince($dateObj) - returns the number of full years (int) between the given date in the past, and now
* $monthsSince($dateObj) - returns the number of full months (int) between the given date in the past, and now
* $daysSince($dateObj) - returns the number of full days (int) between the given date in the past, and now
* $monthsUntil($dateObj) - returns the number of full months (int) between now and the given future date
* $daysUntil($dateObj) - returns the number of full days (int) between now and the given future date
* $concept($conceptId) - returns the Concept with the given numeric concept id

All functions are accessible within the `$fn` variable.  For example, to get the current date you would use:  `$fn.now()`

#### Expression Syntax

You should consult online documentation for more information on what is possible with Velocity expressions.
Please find some documentation here:  https://velocity.apache.org/engine/2.0/vtl-reference.html

Conditionals are by far the most common syntax construct that will be useful.  They support if/else/elseif syntax:

`#if($numPickups == 0)There are no pickups#{elseif}($fn.$monthsSince($lastPickupDate) > 6)No pickups for more than 6 months{else}Recently picked up#end`

You can find more examples of usage in the existing status definition files within this folder.

## Defining a Status Data Widget

For the use case of defining a statusData widget on a patient summary or dashboard, one would define that widget
like this:

```json
{
  "id": "pih.app.hiv.alerts",
  "label": "pih.app.hiv.status.title",
  "icon": "fas fa-fw fa-exclamation-circle",
  "order": "1",
  "config": {
    "configFile": "hiv/hivStatuses.yml"
  },
  "extensions": [
    {
      "id": "pih.app.hiv.alerts.hivDashboard",
      "appId": "pih.app.hiv.alerts",
      "extensionPointId": "patientDashboard.firstColumnFragments",
      "extensionParams": {
        "provider": "pihcore",
        "fragment": "dashboardwidgets/statusData"
      }
    }
  ]
}
```

As seen in the example above, one can fully configure a new "statusData" widget by passing in a reference to a configFile.
Each definition contained within the configFile will be evaluated and displayed in the status widget.

## Authoring and testing status data expressions

To facilitate authoring and testing status data definitions, there are a few administrative testing tools available.

### Status Data Viewer

This allows you to evaluate all of the definitions in a given status data file, or a single definition within that file,
for a given patient.  This is particularly useful for testing status development prior to exposing these via a widget.

This tool can be found at:  `<baseUrl>/pihcore/admin/statusData.page`

### Status Expression Tester

This tool allows you to test your SQL definition and an expression that uses this, to test that both your query and your
velocity expression is functioning as expected and to help with debugging any issues.

This tool can be found at:  `<baseUrl>/pihcore/admin/statusAdmin.page`

### Configuration Administration

This tool allows you to view and reload configuration at runtime without restarting the server.  This tool needs to be 
used with caution to avoid disrupting current users.  A particularly useful feature of this tool is the ability to 
refresh the message source with new translations that have been added to the messageproperties configuration domain.

This tool can be found at:  `<baseUrl>/pihcore/admin/configuration.page`