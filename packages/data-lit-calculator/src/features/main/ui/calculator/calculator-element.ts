// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { DatabaseElement, useObservableValues } from "@adobe/data-lit";
import { FeatureDatabase } from "../../ecs/feature-database.js";
import { styles } from "./calculator.css.js";
import * as presentation from "./calculator-presentation.js";

const tagName = "adobe-calculator";

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: CalculatorElement;
  }
}

@customElement(tagName)
export class CalculatorElement extends DatabaseElement<typeof FeatureDatabase.plugin> {
  static styles = styles;

  get plugin() {
    return FeatureDatabase.plugin;
  }

  render() {
    const values = useObservableValues(
      () => ({ display: this.service.computed.display }),
      [],
    );

    return presentation.render({
      display: values?.display ?? "0",
      inputDigit: this.service.transactions.inputDigit,
      inputDecimal: this.service.transactions.inputDecimal,
      setOperation: this.service.transactions.setOperation,
      evaluate: this.service.transactions.evaluate,
      clear: this.service.transactions.clear,
    });
  }
}
