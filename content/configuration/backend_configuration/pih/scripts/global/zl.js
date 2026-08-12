function setUpExpandableContacts(badPhoneNumberMsg) {
  var contactsToShow = 1;
  var elem = document.getElementsByClassName("contacts");
  var maxContacts = elem.length;

  var hideOtherContacts = function () {
    jq("#contact-2").hide();
    jq("#contact-3").hide();
    jq("#contact-4").hide();
    jq("#contact-5").hide();
    jq("#contact-6").hide();
    jq("#contact-7").hide();
    jq("#contact-8").hide();
    jq("#contact-9").hide();
    jq("#contact-10").hide();
  };

  jq("#contact-" + contactsToShow).show();
  hideOtherContacts();
  jq("#show-less-contacts-button").hide();

  jq("#show-more-contacts-button").click(function () {
    if (maxContacts > contactsToShow) {
      contactsToShow++;
      jq("#contact-" + contactsToShow).show();
      if (contactsToShow > 1) {
        jq("#show-less-contacts-button").show();
      }
      if (contactsToShow == 10) {
        jq("#show-more-contacts-button").hide();
      }
    }
  });

  jq("#show-less-contacts-button").click(function () {
    if (maxContacts > contactsToShow || contactsToShow == 10) {
      if (contactsToShow > 1) {
        jq("#contact-" + contactsToShow).hide();
        contactsToShow--;
        if (contactsToShow == 1) {
          jq("#show-less-contacts-button").hide();
        }
      }
      jq("#show-more-contacts-button").show();
    }
  });

  for (let i = 0; maxContacts > i; i++) {
    //showing contact if exist data
    let contactHasValues = false;
    jq(`#contact-${i} input:checked, #contact-${i} input[type=text]`).each(
      function (j, domEl) {
        const element = jq(domEl);
        if (element.val()) {
          contactHasValues = true;
        }
      }
    )
    if (contactHasValues) {
      jq(`#contact-${i}`).show();
      contactsToShow++;
    }

    // Phone Number Regex validation
    jq("#contact-hiv-phone-" + i)
      .children(":input")
      .change(function (e) {
        var val = e.target.value;
        phoneNumber(val, i);
      });
  }

  function phoneNumber(inputted, index) {

    var pattern1 = /^\d{8}$/;
    var pattern2 = /^\d{4}(?:\)|[-|\s])?\s*?\d{4}$/;

    if (inputted.match(pattern1) || inputted.match(pattern2)) {
      jq("#next").prop("disabled", false);
      jq("#submit").prop("disabled", false);
      jq("#contact-phone-error-message-" + index).text("");
    } else {
      jq("#contact-phone-error-message-" + index).text(badPhoneNumberMsg);
      jq("#next").prop("disabled", true);
      jq("#submit").prop("disabled", true);
    }
  }

}

/**
 * Given the widget ids of two obs of value dates, assures that the "start date" cannot be after the "end date"
 * and that the "end date" cannot be before the "start date" by updating the min and max dates of the respective
 * date pickers
 *
 * To use:
 *    1) Add the class "startDateEndDate" to a parent element in the DOM that includes both the start and end date widgets
 *    2) Apply "startDate" class to the start datepicker element, and "endDate" to the end datepicker element
 *    3) Call setupDatepickerStartAndEndDateValidation() upon page load
 */
function setUpDatepickerStartAndEndDateValidation() {

  jq(".startDateEndDate").each(function (j, domEl) {

    const startDatepicker = jq(jq(this).find('.startDate'));
    const endDatepicker = jq(jq(this).find('.endDate'));

    if (startDatepicker) {
      startDatepicker.change(function () {
        let startDate = startDatepicker.find('input[type=text]').datepicker('getDate');
        if (startDate) {
          endDatepicker.find('input[type=text]').datepicker('option', 'minDate', startDate);
        }
      });
    }

    if (endDatepicker) {
      endDatepicker.change(function () {
        let endDate = endDatepicker.find('input[type=text]').datepicker('getDate');
        if (endDate) {
          startDatepicker.find('input[type=text]').datepicker('option', 'maxDate', endDate);
        }
      });
    }
  });
}

function setUpPhoneNumberRegex(badPhoneNumberMsg) {

  jq('.phoneRegex').each(function (j, domEl) {

    jq(this).change(function (e) {
      let phone = e.target.value;
      if (phoneNumberRegex(phone)) {
        jq(this).find('span').first().hide();
        jq(this).find('span').first().text('');
      } else {
        jq(this).find('span').first().show();
        jq(this).find('span').first().text(badPhoneNumberMsg);
      }
    })
  })
}

function phoneNumberRegex(phone) {
  return phone.match(phoneNumberPattern().pattern1) || phone.match(phoneNumberPattern().pattern2) || phone.match(phoneNumberPattern().pattern3);
}

function phoneNumberPattern() {
  return {
    pattern1: /^\d{8}$/,
    pattern2: /^\d{4}(?:\)|[-|\s])?\s*?\d{4}$/,
    pattern3: /^\+?(?:\d ?){6,14}\d$/
  }
}

/**
 * This function provides specific client-side functionality for with "checkbox" style obs with an obs date component;
 * It is currently used for the "screening for syphilis", and configured by applying a class "dateDatepickerInTheFuture" to the relevant obs
 *
 * It does two main things:
 *   ** Hide/show the datepicker input based on whether the checkbox is checked
 *   ** Doesn't allow date selected to be ahead of the current date
 *
 * Ideally, 1) The HTML Form Entry module would handle this validation client-side (currently it only handles it
 * server-side) and 2) would not allow the date to after the *encounter date* (not just the current date)
 *
 * We have a ticket for the above work, see: https://issues.openmrs.org/browse/HTML-799 , and if we implement this
 * we could potentially rework this function to just be about hiding/showing the date
 *
 * @param widgetId
 */
function setUpObsWithObsDateTime(widgetId) {
  if (getField(widgetId + '.date') && getField(widgetId + '.value')) {
    getField(widgetId + '.date').hide();
    getField(widgetId + '.date').datepicker('option', 'maxDate', new Date());

    getField(widgetId + '.value').change(function () {
      const isChecked = getValue(widgetId + '.value');
      if (isChecked) {
        getField(widgetId + '.date').show();
      } else {
        setValue(widgetId + '.date', '')
        getField(widgetId + '.date').hide();
      }
    })
  }
}

function setupReturnVisitDateValidation(encounterDate, returnVisitDateLessThanEncounterDateMsg, badReturnVisitDateMsg) {

  const domEl = getField('apptDate.value');
  const yrRange = encounterDate.getFullYear() + ":" + (new Date().getFullYear() + 1);
  domEl.datepicker('option', 'yearRange', yrRange);
  domEl.prop("readonly", "readonly");

  const returnVisitDateValidation = function () {
    const nextVisitDate = domEl.datepicker('getDate');
    if (nextVisitDate) {
      const differnenceInYears = nextVisitDate.getFullYear() - encounterDate.getFullYear();

      if (differnenceInYears < 1 && nextVisitDate > encounterDate) {
        getField('apptDate.error').text('').hide();
        return true;
      }
      else if (differnenceInYears == 1 && nextVisitDate.getMonth() <= encounterDate.getMonth()) {
        getField('apptDate.error').text('').hide();
        return true;
      }
      else if (differnenceInYears <= 0 && encounterDate > nextVisitDate) {
        getField('apptDate.error').text(returnVisitDateLessThanEncounterDateMsg).show();
        return false;
      }
      else {
        getField('apptDate.error').text(badReturnVisitDateMsg).show();
        return false;
      }
    } else {
      return true;
    }
  }

  jq(domEl).change(returnVisitDateValidation);
  beforeSubmit.push(returnVisitDateValidation);



}

function restrictInputOnlyNumber(input_id) {

  // Track the id of the input and change the type to number
  jq(`#${input_id} input`).attr('type', 'number')


}


/**
 * Manages the activation of widget inputs based on the state of a radio button and an optional checkbox.
 *
 * @param {string|null} checkboxId - The ID of the checkbox associated with the radio button (optional).
 * @param {string} radioButtonId - The ID of the radio button controlling the widget inputs.
 * @param {string[]} widgetIds - The IDs of the widgets whose inputs should be enabled or disabled.
 * @param {string[]} requiredWidgetIds - The IDs of the input widgets that may be required based on the radio button state.
 * @param {string} requiredMsg - The message to display when a widget input is required.
 */
function manageInputActivationForRadioButton(checkboxId = null, radioButtonId, widgetIds, requiredWidgetIds, requiredMsg) {

  let isRequired = true;
  let checkboxValue = null;
  let radioButtonElm = jq(radioButtonId).find('input:checked');
  let checkboxElm = jq(checkboxId).find('input:checked');

  const radioButtonValue = jq(radioButtonId).find('input:checked').val();
  // Check if the radio button has a value (i.e., it is checked).
  if (radioButtonValue) {
    setInputWidgetsDisabled(widgetIds, false)
  } else {
    setInputWidgetsDisabled(widgetIds, true)
  }

  //Check if the radio button displays when the checkbox button is checked.
  if (checkboxId) {

    checkboxValue = jq(checkboxId).find('input:checked').val();

    jq(checkboxId).change(function () {
      const elem = jq(this).find('input:checked');
      if (elem.val() == undefined) {
        setInputWidgetsDisabled(widgetIds, true)
        checkboxElm = elem
        radioButtonElm = jq(checkboxId).find('input:checked');
        setRequiredForRadioButton(radioButtonId, requiredMsg, checkboxElm, radioButtonElm)
        returnRequiredInputWidgets();

      } else {
        checkboxElm = elem
        setRequiredForRadioButton(radioButtonId, requiredMsg, checkboxElm, radioButtonElm)
        returnRequiredInputWidgets()
      }
    })
  }

  // Enable input when the radio button is checked.
  jq(radioButtonId).change(function () {
    const elem = jq(this).find('input:checked');
    if (elem.val() == undefined) {
      setInputWidgetsDisabled(widgetIds, true)
      radioButtonElm = elem
      setRequiredForRadioButton(radioButtonId, requiredMsg, checkboxElm, radioButtonElm)
      returnRequiredInputWidgets()
    } else {
      radioButtonElm = elem
      setInputWidgetsDisabled(widgetIds, false)
      setRequiredForRadioButton(radioButtonId, requiredMsg, checkboxElm, radioButtonElm)
      returnRequiredInputWidgets()
    }
  })

  // Function to determine if the input widgets specified by requiredWidgetIds are required.
  const returnRequiredInputWidgets = function () {

    jq(requiredWidgetIds).each(function (i, domEl) {

      let el = jq(domEl).find('input[type=text]')

      if (checkboxElm.val() == undefined) {
        setValue(`${domEl.substring(1)}.value`, '');
        getField(`${domEl.substring(1)}.error`).text('').hide();
        isRequired = true;
      } else if (checkboxElm.val() == undefined && radioButtonElm.val() == undefined) {
        setValue(`${domEl.substring(1)}.value`, '');
        getField(`${domEl.substring(1)}.error`).text('').hide();
        isRequired = true;
      } else if (checkboxElm.val() != undefined && radioButtonElm.val() == undefined) {
        setValue(`${domEl.substring(1)}.value`, '');
        getField(`${domEl.substring(1)}.error`).text('').hide();
        jq(radioButtonId).find('input[type="radio"]').focus()
        isRequired = false;
      } else {
        if (el.val() && checkboxElm.val() != undefined && radioButtonElm.val() != undefined) {
          getField(`${domEl.substring(1)}.error`).text('').hide();
          isRequired = true;
        } else {
          getField(`${domEl.substring(1)}.error`).text(requiredMsg).show();
          el.focus()
          isRequired = false
        }
      }
    })
    return isRequired;

  }

  // Attach the returnInputWidgetsRequired function as a change event handler to each element specified by requiredWidgetIds
  jq(requiredWidgetIds).each(function (i, domEl) {
    jq(domEl).change(returnRequiredInputWidgets)
  })
  beforeSubmit.push(returnRequiredInputWidgets);
}

/**
 * Disables the input fields of the specified widgets.
 *
 * @param {string[]} widgetIds - The IDs of the widgets whose input fields should be disabled.
 * @param {boolean} disabled - Indicates whether the input fields should be disabled (true) or enabled (false).
 */
function setInputWidgetsDisabled(widgetIds, disabled) {

  if (disabled) {
    jq(widgetIds).each(function (i, domEl) {
      jq(domEl).find('input').first().prop('disabled', disabled);

    })
  } else {
    jq(widgetIds).each(function (i, domEl) {
      jq(domEl).find('input').first().prop('disabled', disabled);
    })
  }
}


/**
 * Function to set the 'required' attribute for radio buttons under the specified radioButtonId.
 * @param {string} radioButtonId - The ID of the radio button element containing the radio buttons to set the 'required' attribute for.
 * @param {string} requiredMsg - The message to display when the radio buttons are required.
 * @param {jQuery} checkboxElm - The jQuery object representing the checkbox element to be checked for presence.
 * @param {jQuery} radioButtonElm - The jQuery object representing the radio button element.
 */
function setRequiredForRadioButton(radioButtonId, requiredMsg, checkboxElm, radioButtonElm) {

  if (checkboxElm.val() == undefined) {
    // If the checkbox element is undefined, hide the error message.
    getField(`${radioButtonId.substring(1)}.error`).text('').hide();
  } else if (checkboxElm.val() != undefined && radioButtonElm.val() == undefined) {
    // If checkbox is defined but radio button is not, show the required error message.
    getField(`${radioButtonId.substring(1)}.error`).text(requiredMsg).show();
  } else {
    // Otherwise, hide the error message.
    getField(`${radioButtonId.substring(1)}.error`).text('').hide();
  }
}



// Function to check if any checkboxes are selected
function anyCheckboxesSelected(containerSelector) {
  return jq(`${containerSelector} input[type="checkbox"]:checked`).length > 0;
}

/**
 * Updates the required attribute of the last checkbox in the given container.
 * @param {string} containerSelector - The selector for the container containing checkboxes.
 * @param {string} transRequiredMsgId - The selector for the element to display the required message.
 * @param {string} requiredMsg - The message to display when the last checkbox is required.
 * @returns {boolean} - Returns true if the last checkbox is required, false otherwise.
 */
function updateLastCheckboxRequired(containerSelector, transRequiredMsgId, requiredMsg) {
  // Initialize the flag to keep track of the last checkbox state.
  let islastCheckbox = false;

  // Function to update the required attribute of the last checkbox
  const updateLastCheckbox = function () {

    // Select the last checkbox within the container using the given selector
    let lastCheckbox = jq(`${containerSelector} input[type="checkbox"]`).last();

    // Clear and hide the required message
    jq(transRequiredMsgId).text('').hide()

    // Check if any checkboxes are selected within the container using the anyCheckboxesSelected function.
    if (!anyCheckboxesSelected(containerSelector)) {

      // Display the required message and focus on the last checkbox
      jq(transRequiredMsgId).text(requiredMsg).show()
      lastCheckbox.focus()
      islastCheckbox = false;

    } else {
      jq(transRequiredMsgId).text('').hide()
      islastCheckbox = true;
    }
    return islastCheckbox;
  }

  // Initial call to updateLastCheckboxRequired to set the required attribute on page load.
  updateLastCheckbox()

  // Attach event listeners to the checkboxes in the container to update the required attribute dynamically.
  jq(`${containerSelector} input[type="checkbox"]`).change(updateLastCheckbox)
  jq(`${containerSelector} input[type="checkbox"]`).keyup(updateLastCheckbox)

  // Add the updateLastCheckboxRequired function to the beforeSubmit array to call it before form submission.
  beforeSubmit.push(updateLastCheckbox);
}


function showConfirmBox(message, onYes, onNo) {
    jq('#confirmText').text(message);
    jq('#confirmOverlay').fadeIn(150);

    // clean old handlers
    jq('#confirmYes').off('click');
    jq('#confirmNo').off('click');

    jq('#confirmYes').on('click', function (e) {
      e.preventDefault();
      jq('#confirmOverlay').fadeOut(150);
      if (typeof onYes === 'function') onYes();
    });

    jq('#confirmNo').on('click', function (e) {
      e.preventDefault();
      jq('#confirmOverlay').fadeOut(150);
      if (typeof onNo === 'function') onNo();
    });
}





function formatMessage(template, params) {
  return template.replace(/{(\d+)}/g, function (_, index) {
    return params[index] ?? '';
  });
}

function checkFields() {

  let chwValue = jq('#chwName input').val()?.trim();
  let comValue = $('#comName input').val()?.trim();

  if (chwValue) {
    jq('#medPickupComId').hide();
    jq('#medPickupChwId').show();
  } else if (comValue) {
    jq('#medPickupChwId').hide();
    jq('#medPickupComId').show();
  } else {

    jq('#medPickupChwId, #medPickupComId').show();
  }
}

function checkFieldsEditMode() {
  let chwValue = jq('#chwName .value').text().trim();
  let comValue = jq('#comName .value').text().trim();

  let chwEmpty = jq('#chwName .emptyValue').length > 0;
  let comEmpty = jq('#comName .emptyValue').length > 0;

  if (!chwEmpty && chwValue !== '') {

    jq('#medPickupComId').hide();
    jq('#medPickupChwId').show();
  } else if (!comEmpty && comValue !== '') {
    // COM has value → hide CHW
    jq('#medPickupChwId').hide();
    jq('#medPickupComId').show();
  } else {

    jq('#medPickupChwId, #medPickupComId').show();
  }
}


