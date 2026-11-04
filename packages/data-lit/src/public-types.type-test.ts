// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Compile-time tests for public element and hook declarations.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { ApplicationHost } from "./elements/application-host.js";
import { useElement } from "./hooks/use-element.js";

const _hostTag = (): ApplicationHost => document.createElement("application-host");

const _tagSelector = (): HTMLButtonElement | null => useElement("button");
const _cssSelector = (): HTMLElement | null => useElement(".target");
const _typedCssSelector = (): HTMLInputElement | null => useElement<HTMLInputElement>("input.name");
const _component = (): HTMLElement => useElement();
