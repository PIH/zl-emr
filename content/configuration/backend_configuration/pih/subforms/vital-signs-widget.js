
// Note that is currently customized with vital ranges for *pregnancy* patients as defined here:
//  https://github.com/PIH/openmrs-config-pihsl/blob/master/configuration/conceptreferencerange/vitalsRanges.csv
// TODO: figure out to pull in the values from the concept reference range table so that we can support other patient types.  We will also need to handle the "yellow" range which is not supported in the reference range table
// TODO: see https://pihemr.atlassian.net/browse/SL-1153

    const priorities = {
        GREEN: {
            value: 0,
            message: "Normal",
            className: "triage-label-green"
        },
        YELLOW: {
            value: 1,
            message: "Prompt",
            className: "triage-label-yellow"
        },
        ORANGE: {
            value: 2,
            message: "Urgent",
            className: "triage-label-orange"
        },
        RED: {
            value: 3,
            message: "STAT",
            className: "triage-label-red",
            triageClassName: "triage-dark-red"
        }
    };

    function getPrioritiesClasses() {
        let classNames = [];
        for (const priority in priorities) {
            classNames.push(priorities[priority].className);
            if (priorities[priority].triageClassName) {
                classNames.push(priorities[priority].triageClassName);
            }
        }
        return classNames.join(" ");
    }

    const classNames = getPrioritiesClasses();

    function evaluateBpSystolic(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if (numericValue &lt;= 79) {
                return priorities.RED;
            } else if ((numericValue &gt; 139) &amp;&amp; (numericValue &lt; 160)) {
                return priorities.YELLOW;
            } else if (numericValue &gt;= 160) {
                return priorities.RED;
            }
        }
        return retValue;
    }

    function evaluateBpDiastolic(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if (numericValue &lt;= 50) {
                return priorities.RED;
            } else if ((numericValue &gt; 89) &amp;&amp; (numericValue &lt; 110)) {
                return priorities.YELLOW;
            } else if (numericValue &gt;= 110) {
                return priorities.RED;
            }
        }
        return retValue;
    }

    function evaluateHeartRate(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if (numericValue &lt;= 39) {
                return priorities.RED;
            } if (numericValue &lt; 50) {
                return priorities.ORANGE;
            } else if ((numericValue &gt; 119) &amp;&amp; (numericValue &lt; 131)) {
                return priorities.ORANGE;
            } else if (numericValue &gt;= 131) {
                return priorities.RED;
            }
        }
        return retValue;
    }

    function evaluateRespiratoryRate(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if (numericValue &lt; 12) {
                return priorities.ORANGE;
            } else if (numericValue &gt; 26) {
                return priorities.ORANGE;
            }
        }
        return retValue;
    }

    function evaluateTemperature(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if ((numericValue &lt;= 34.9) || (numericValue &gt;= 40)) {
                return priorities.RED;
            } else if ((numericValue &gt;= 38) &amp;&amp; (numericValue &lt;= 38.2)) {
                return priorities.YELLOW;
            } else if ((numericValue &gt; 38.2) &amp;&amp; (numericValue &lt; 40)) {
                return priorities.ORANGE;
            }
        }
        return retValue;
    }

    function evaluateFhr(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if ((numericValue &lt;= 109 ) || (numericValue &gt;= 161)) {
                return priorities.RED;
            }
        }
        return retValue;
    }

    function evaluateOxygenSaturation(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if (numericValue &lt;= 93) {
                return priorities.RED;
            } else if (numericValue &lt; 96) {
                return priorities.ORANGE;
            }
        }
        return retValue;
    }

    let vitalsInfo = {
        bp_systolic: {
            evaluate: evaluateBpSystolic,
            value: null
        },
        bp_diastolic: {
            evaluate: evaluateBpDiastolic,
            value: null
        },
        heart_rate: {
            evaluate: evaluateHeartRate,
            value: null
        },
        respiratory_rate: {
            evaluate: evaluateRespiratoryRate,
            value: null
        },
        temperature_c: {
            evaluate: evaluateTemperature,
            value: null
        },
        o2_sat: {
            evaluate: evaluateOxygenSaturation,
            value: null
        },
        fhr: {
            evaluate: evaluateFhr,
            value: null
        },
        fhr_second: {
            evaluate: evaluateFhr,
            value: null
        }
    };

    function evaluateVitals() {
        let priority = priorities.GREEN;
        let priorityValue = 0;
        for (const obj in vitalsInfo) {
            let vitalValue = vitalsInfo[obj].value;
            let evalPriority = vitalsInfo[obj].evaluate(vitalValue);
            priorityValue = priorityValue + evalPriority.value;
        }
        switch ( priorityValue ) {
            case 0:
                priority = priorities.GREEN;
                break;
            case 1:
                priority = priorities.YELLOW;
                break;
            case 2:
                priority = priorities.ORANGE;
                break;
                default:
                  priority = priorities.RED;
        }

        return priority;
    }

    function calculatePriority() {
        let globalPriority = evaluateVitals();
        if (globalPriority.value &gt;= 2) {
            let drNotified = jq('#contactDr input[type="checkbox"]').is(':checked');
            if ( !drNotified ) {
                jq('.submitButton.confirm.right').attr('disabled', true);
            }
            jq("#confirmMsg").show();
        } else {
            jq('.submitButton.confirm.right').attr('disabled', false);
            jq("#confirmMsg").hide();
        }
        if (typeof calculateTriagePriority === "function") {
            globalPriority = calculateTriagePriority();
        }
        jq('#sticky').removeClass(classNames).addClass(globalPriority.triageClassName ? globalPriority.triageClassName : globalPriority.className);
        jq('#statusMessage').text(globalPriority.message);
        return globalPriority;
    }

jq(document).ready( function() {

    <ifMode mode="VIEW" include="false">
        //Postnatal Ward,  MCOE Post Op ward, Kangaroo Care, Quiet Ward
        const noFhrLocations = ["ff0d5e73-3fe0-437f-90ba-7d605ac03dc0", "a39ec469-d1f9-11f0-9d46-169316be6a48", "81080213-d1f9-11f0-9d46-169316be6a48", "28660b7f-3450-4b86-b840-9670ec68235f"];
        const locationUuid = '<lookup complexExpression="$sessionContext.sessionLocation.uuid"/>';
        const isFound = noFhrLocations.some( location => location.toLowerCase() === locationUuid.toLowerCase());
        if (isFound) {
            jq("#fhrDiv").hide()};

    </ifMode>

    jq('#contactDr input[type="checkbox"]').on('change', function() {
        if (jq(this).is(':checked')) {
            // Checkbox is checked
            jq('.submitButton.confirm.right').attr('disabled', false);
        } else {
            calculatePriority();
        }
    });

    // the following calculations happen only in the view mode
    jq(".vitals-values").find('.value').each( function() {
        const vitalsId = jq(this).parent("span").attr('id');
        const vitalValue = jq(this).text();
        let inputElement = jq(this);
        jq(inputElement).removeClass('value');
        jq(inputElement).removeClass(classNames);
        let colorCodingDiv = jq("#" + vitalsId).closest(".colorCodingValue");
        if (vitalsId &amp;&amp; vitalsInfo[vitalsId]) {
            if (vitalValue) {
                vitalsInfo[vitalsId].value = vitalValue;
                let vitalsPriority = vitalsInfo[vitalsId].evaluate(vitalsInfo[vitalsId].value);
                if ( vitalsPriority &amp;&amp; colorCodingDiv) {
                    setTimeout(() => {
                        jq(colorCodingDiv).addClass(vitalsPriority.className);
                    }, 100);
                }
            } else {
                vitalsInfo[vitalsId].value = null;
                setTimeout(() => {
                    jq(inputElement).addClass('value');
                }, 100);
            }
        }
    });

    jq(".vitals-values").find('input').on("blur", function() {
        const vitalsId = jq(this).closest("span").attr('id');
        const vitalValue = jq(this).val();
        let inputElement = jq(this);
        jq(inputElement).removeClass('legalValue');
        jq(inputElement).removeClass(classNames);
        if (vitalsId  &amp;&amp; vitalsInfo[vitalsId]) {
            if (vitalValue) {
                vitalsInfo[vitalsId].value = vitalValue;
                let vitalsPriority = vitalsInfo[vitalsId].evaluate(vitalsInfo[vitalsId].value);
                if (vitalsPriority) {
                    setTimeout(() => {
                        jq(inputElement).removeClass('legalValue').addClass(vitalsPriority.className);
                    }, 100);
                }
            } else {
                vitalsInfo[vitalsId].value = null;
                setTimeout(() => {
                    jq(inputElement).addClass('legalValue');
                }, 100);
            }
        }
        calculatePriority();
    });

    jq(".vitals-values").find('input').attr('autocomplete', 'off');
    jq(".vitals-values").find('input').trigger("blur");
    calculatePriority();

});