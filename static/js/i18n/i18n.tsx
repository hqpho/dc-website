/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Helpers for formatJS i18n library. More info at formatjs.io
 * NOTE: Messages in this file will not be extracted for translation.
 */

import React from "react";
import { createIntl, createIntlCache, IntlCache, IntlShape } from "react-intl";

// A single cache instance can be shared for all locales.
// TODO(beets): might not be necessary since we create one intl object.
const intlCache: IntlCache = createIntlCache();

// This IntlShape object will be used for both React Intl's
// React Component API (arg for RawIntlProvider) and
// Imperative API (format<X> method).
let intl: IntlShape = createIntl({ locale: "en", messages: {} }, intlCache);

/**
 * Load compiled messages into the global intl object.
 *
 * @param locale: Locale determined server-side for consistency.
 * @param modules: An array of Promises from calling import on the compiled
 *   message module for the current locale. Note that this needs to be done from
 *   the app so that we won't have to bundle all compiled messages across apps.
 *   See https://webpack.js.org/api/module-methods/#dynamic-expressions-in-import
 */
function loadLocaleData(
  locale: string,
  modules: Promise<Record<any, any>>[]
): Promise<void> {
  const allMessages = {};
  // If no i18n modules are provided, just set the locale and return.
  if (modules.length === 0) {
    intl = createIntl({ locale, messages: {} }, intlCache);
    return Promise.resolve();
  }
  // Otherwise, set the locale and load the i18n modules.
  return Promise.all(modules)
    .then((messages) => {
      for (const msg of messages) {
        Object.assign(allMessages, msg.default);
      }
      intl = createIntl({ locale, messages: allMessages }, intlCache);
    })
    .catch((err) => {
      console.error(err);
      intl = createIntl({ locale, messages: {} }, intlCache);
    });
}

/**
 * Returns translation for message with :id. If unavailable, :id is returned as
 * the translation.
 *
 * Note: Only use this for variables. Raw strings in JS should call
 * intl.formatMessage or <FormattedMessage> directly in order for the extractor
 * to pick up the id.
 *
 * @param id: message bundle id
 * @return translation for :id, or :id if translation is unavailable.
 */
function translateVariableString(id: string): string {
  if (!id) {
    return "";
  }
  return intl.formatMessage({
    // Matching ID as above
    id,
    // Default Message in English.
    // Can consider suppressing log error when translation not found.
    defaultMessage: id,
    description: id,
  });
}

/**
 * Adds / updates the hl parameter for the searchParams to maintain the current
 * page's locale.
 * TODO(beets): Add tests for this function.
 *
 * @param searchParams: to update
 * @return potentially updated searchParams
 */
function localizeSearchParams(searchParams: URLSearchParams): URLSearchParams {
  if (intl.locale == "en") {
    return searchParams;
  }
  searchParams.set("hl", intl.locale);
  return searchParams;
}

/**
 * Adds / updates the hl parameter for the link to maintain the current page's locale.
 * TODO(beets): Add tests for this function.
 *
 * @param href: to update
 * @return potentially updated href
 */
function localizeLink(href: string): string {
  try {
    const url = new URL(href, document.location.origin);
    url.search = localizeSearchParams(
      new URLSearchParams(url.searchParams)
    ).toString();
    return url.toString();
  } catch (e) {
    return href;
  }
}

/**
 * Properties for LocalizedLink. Property names are analogous to those for <a> tags.
 */
interface LocalizedLinkProps {
  className?: string;
  href: string;
  text: string | JSX.Element;
  // Callback function when a link is clicked.
  handleClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * Adds / updates the hl parameter for the link to maintain the current page's locale.
 * TODO(beets): Add tests for this component.
 *
 * @param props: <a> tag properties to include
 * @return An <a> tag JSX element.
 */
function LocalizedLink(props: LocalizedLinkProps): JSX.Element {
  const href = props.href ? localizeLink(props.href) : null;
  return (
    <a
      href={href}
      className={props.className ? props.className : null}
      onClick={props.handleClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
    >
      {props.text}
    </a>
  );
}

/**
 * Formats numbers to the currently set locale. Only shows a certain number of
 * significant digits. To call this, i18n/compiled-strings/{locale}/units.json
 * must be loaded. Only a subset of units are available. To add a unit, add the
 * appropriate "short-other-nominative" unit from CLDR, as well as the display
 * name for the unit to each locale's unit message bundle. e.g.
 * https://unicode-org.github.io/cldr-staging/charts/38/summary/ru.html or
 * https://github.com/unicode-org/cldr/blob/release-38-1/common/main/de.xml
 *
 * @param value: the number to format
 * @param unit: (optional) short unit
 *
 * @return localized display string for the number
 */
function formatNumber(
  value: number,
  unit?: string,
  useDefaultFormat?: boolean,
  numFractionDigits?: number,
  options?: Intl.NumberFormatOptions
): string {
  if (isNaN(value)) {
    return "-";
  }
  if (useDefaultFormat) {
    return Intl.NumberFormat(intl.locale).format(value);
  }
  const formatOptions: Intl.NumberFormatOptions = options || {
    /* any is used since not all available options are defined in NumberFormatOptions */
    compactDisplay: "short",
    maximumSignificantDigits: 3,
    notation: "compact",
    style: "decimal",
  };

  if (numFractionDigits !== undefined) {
    formatOptions.maximumFractionDigits = numFractionDigits;
    formatOptions.minimumFractionDigits = numFractionDigits;
    delete formatOptions.maximumSignificantDigits;
  }

  let unitKey: string;
  switch (unit) {
    case "₹":
      formatOptions.style = "currency";
      formatOptions.currency = "INR";
      formatOptions.currencyDisplay = "code";
      break;
    case "$":
    case "USD":
    case "USDollar":
      formatOptions.style = "currency";
      formatOptions.currency = "USD";
      formatOptions.currencyDisplay = "code";
      break;
    case "%":
    case "Percent":
    case "Percentage":
      formatOptions.style = "percent";
      value = value / 100; // Values are scaled by formatter for percent display
      break;
    case "Year":
      formatOptions.style = "unit";
      formatOptions.unit = "year";
      formatOptions.unitDisplay = "short";
      break;
    case "MetricTon":
    case "t":
      unitKey = "metric-ton";
      break;
    case "Millions of tonnes":
      unitKey = "mega-ton";
      break;
    case "kWh":
      unitKey = "kilowatt-hour";
      break;
    case "GWh":
      unitKey = "gigawatt-hour";
      break;
    case "g":
      unitKey = "gram";
      break;
    case "kg":
      unitKey = "kilogram";
      break;
    case "L":
      unitKey = "liter";
      break;
    case "celsius":
    case "Celsius":
      unitKey = "celsius";
      break;
    case "μg/m³":
      unitKey = "micro-gram-per-cubic-meter";
      break;
    case "MetricTonCO2e":
    case "MTCO2e":
      unitKey = "metric-tons-of-co2";
      break;
    case "per-million":
      unitKey = "per-million";
      break;
    case "¢/kWh":
      unitKey = "cent-per-kilowatt";
      break;
    case "ppb":
      unitKey = "ppb";
      break;
    case "mgd":
      unitKey = "million-gallon-per-day";
      break;
    default:
      unitKey = unit;
  }
  let returnText = Intl.NumberFormat(intl.locale, formatOptions).format(value);
  if (unitKey) {
    returnText = intl.formatMessage(
      {
        id: unitKey,
        defaultMessage: `{0} {unit}`,
      },
      { 0: returnText, unit }
    );
  }
  return returnText;
}

/**
 * Returns a sentence-cased, translated unit in the current locale for display
 * purposes. To call this, i18n/compiled-strings/{locale}/units.json must be
 * loaded. Only a subset of units are available. To add a unit, add the
 * appropriate display name for the unit from CLDR, e.g.
 * https://unicode-org.github.io/cldr-staging/charts/38/summary/ru.html or
 * https://github.com/unicode-org/cldr/blob/release-38-1/common/main/de.xml
 *
 * @param unit: short unit
 *
 * @return localized display string for the number
 */
function translateUnit(unit: string): string {
  let messageId: string;
  switch (unit) {
    case "$":
      return "USD";
    case "Percent":
    case "Percentage":
    case "%":
      return "%";
    case "t":
      messageId = "metric-ton-display";
      break;
    case "Millions of tonnes":
      messageId = "mega-ton-display";
      break;
    case "kWh":
      messageId = "kilowatt-hour-display";
      break;
    case "g":
      messageId = "gram-display";
      break;
    case "kg":
      messageId = "kilogram-display";
      break;
    case "L":
      messageId = "liter-display";
      break;
    case "celsius":
    case "Celsius":
      messageId = "celsius-display";
      break;
    case "Knot":
    case "Millibar":
    case "SquareKilometer":
      messageId = `${unit}-display`;
    default:
      return unit;
  }
  let displayUnit = intl.formatMessage({
    id: messageId,
    defaultMessage: unit,
  });
  // A hack to use since there is no standardized equivalent:
  // https://github.com/tc39/ecma402/issues/294
  displayUnit =
    displayUnit.charAt(0).toLocaleUpperCase() + displayUnit.slice(1);
  return displayUnit;
}

/**
 * Formats an ISO date string to the current locale.
 *
 * @param dateString: ISO date string
 * @param locale: (optional) locale to use for formatting
 *
 * Example:
 * 2024-11-01 -> November 1, 2024
 * 2024-11 -> November 2024
 * 2024 -> 2024
 *
 * @return formatted date string
 */
function formatDate(dateString: string, locale?: string): string {
  // Regex to match:
  //  - Year (required): 4 digits
  //  - Optional month: -MM
  //  - Optional day: -DD
  const pattern = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
  const match = dateString.match(pattern);

  // If the date string doesn't match the pattern, return it as is
  if (!match) {
    return dateString;
  }

  const year = parseInt(match[1], 10);
  const month = match[2] ? parseInt(match[2], 10) : null;
  const day = match[3] ? parseInt(match[3], 10) : null;

  // Case 1: Year only
  if (!month) {
    return dateString;
  }

  // Otherwise, construct a Date
  // - If day is missing, default to 1
  //   so “2024-11” becomes 2024-11-01
  const date = new Date(year, month - 1, day || 1);

  // Ensure that date is valid
  if (isNaN(date.getTime())) {
    return dateString;
  }

  // Determine how to format:
  // - Year & month -> "November 2024"
  // - Full date -> "November 1, 2024"
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
  };
  if (day) {
    options.day = "numeric";
  }

  // Format using locale
  return date.toLocaleDateString(locale || intl.locale, options);
}

export {
  formatDate,
  formatNumber,
  intl,
  loadLocaleData,
  LocalizedLink,
  localizeLink,
  localizeSearchParams,
  translateUnit,
  translateVariableString,
};
