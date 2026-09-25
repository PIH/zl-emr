/* only show/handle the English conversion fields
   if we are in 'ENTER' or 'EDIT' mode

   mg/dL to mmol/L converter
 */
jq(document).ready( function() {

        var milligramExitHandler = {
            handleExit: function (fieldValue) {
                if (fieldValue &amp;&amp; fieldValue.value()) {
                    setValue('milimole.value', convertMilligramToMonoliter(fieldValue.value()));
                    jq('#milligramme').val('');
                }
                return true;
            }
        }

        ExitHandlers['milligramme'] = milligramExitHandler;

        var convertMilligramToMonoliter = function(mg) {
            return (mg / 18 ).toFixed(1);
        }

});
