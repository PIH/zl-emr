/**
 * This is intended to convert the MUAC from cm to mm
 *   - cm to mm ExitHandler when in edit mode
 */
jq(document).ready(function() {
        var convertCmToMm = function(muacCm) {
            return (muacCm * 10);
        }

        var convertMmToCm = function(muacMm) {
            return (muacMm / 10);
        }

        var cmExitHandler = {
            handleExit: function (fieldValue) {
                if (fieldValue &amp;&amp; fieldValue.value()) {
                    setValue('muac_mm.value', convertCmToMm(fieldValue.value()));
                    getField('muac_mm.value').change() // trigger change event so ratio is updated
                }
                return true;
            }
        }

        var mmExitHandler = {
            handleExit: function (fieldValue) {
                if (fieldValue &amp;&amp; fieldValue.value()) {
                    jq('#muac_cm').val(convertMmToCm(fieldValue.value()));
                }
                return true;
            }
        }

        ExitHandlers['mm'] = mmExitHandler;
        ExitHandlers['cm'] = cmExitHandler;

        // set cm field when reloading
        jq(function() {
            var muac_mm = getValue('muac_mm.value');
            if (muac_mm) {
                jq('#muac_cm').val(convertMmToCm(muac_mm));
            }
        });

        <!-- Convert muac to cm units on the view/dashboard -->
        // handle displaying the muac when in VIEW mode
        jq(function() {

            // we have to iterate through in case there are multiple vitals forms
            // displayed on a single page

                jq('htmlform').each(function(index, form) {

                    // display muac in cm, not mm
                    jq(form).find('#muac_mm').hide();
                    var muacMm = jq(form).find('#muac_mm').find('.value').text();
                    if (muacMm != null &amp;&amp; !isNaN(muacMm) &amp;&amp; muacMm.length &gt; 0) {
                        var muac = convertMmToCm(muacMm);
                        if (muac != null &amp;&amp; !isNaN(muac)) {
                            jq(form).find('#muac_cm_display').text(muac);
                        }
                    } else {
                        jq(form).find('#muac_cm_display').text("____");
                    }
                });

            });

});
