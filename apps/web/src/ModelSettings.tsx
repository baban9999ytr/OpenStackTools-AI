import type { ModelId, ModelOptions, ModelSelection, Profile, ProductMode } from "./api";
import { usePreferences } from "./preferences";
import { useState } from "react";

const profiles: Array<{ id: Profile; model: ModelId; use: string; cost: string }> = [
  { id: "economical", model: "gpt-6-luna", use: "Routine customer questions and appointments", cost: "Lowest relative cost" },
  { id: "balanced", model: "gpt-6.1-terra", use: "Everyday conversation with balanced cost and response time", cost: "Midrange relative cost" },
  { id: "advanced", model: "gpt-6.1-sol", use: "Complex, multi-step customer requests", cost: "Highest relative cost" },
];
const effortOrder = ["none", "low", "medium", "high", "xhigh", "max"];
export function ModelSettings({ options, value, onChange }: { options: ModelOptions | null;
  value: ModelSelection | null; onChange: (value: ModelSelection) => void }) {
  const { t } = usePreferences();
  const [adjustment, setAdjustment] = useState("");
  if (!options) return <p role="status">{t("Loading model options…")}</p>;
  const selectedModel = value?.mode === "custom" ? value.model : profiles.find((item) => item.id === value?.profile)?.model;
  const capability = selectedModel ? options.models[selectedModel] : undefined;
  return <fieldset className="model-settings">
    <legend>{t("AI model profile")}</legend>
    {!value && <p className="muted">{t("Existing model settings are preserved until you choose a profile.")}</p>}
    <div className="model-profile-grid" role="radiogroup" aria-label={t("Model mode")}>
      {(["normal", "powerful", "very_powerful", "automatic"] as ProductMode[]).map((choice, index) => {
        const option = options.productModes?.find((item) => item.choice === choice);
        return <label className="model-profile" key={choice}>
          <input type="radio" name="productMode" checked={value?.mode === "product" && value.choice === choice}
            disabled={!option?.available} onChange={() => onChange({ mode: "product", choice })} />
          <strong>{t(["Normal", "Powerful", "Very Powerful", "Automatic"][index]!)}</strong>
          <span>{["GPT-6 Luna", "GPT-6.1 Sol", "GPT-6 Astra", t("Authorized Luna baseline only; no escalation.")][index]}</span>
          <small>{option?.available ? t("Available") : t(option?.reason || "Project access has not been verified")}</small>
          {option && <small>{t("Reasoning level")}: {t(option.reasoningEffort)} · {t("Policy ceiling")}: {t(options.maxReasoningEffort)}</small>}
        </label>;
      })}
    </div>
    <p>{t("Higher-capability models and advanced reasoning settings may consume your monthly balance faster and increase response latency.")}</p>
    <h4>{t("Existing profiles and custom settings")}</h4>
    <div className="model-profile-grid" role="radiogroup" aria-label={t("AI model profile")}>
      {profiles.map((item) => <label className={`model-profile ${value?.profile === item.id ? "selected" : ""}`} key={item.id}>
        <input type="radio" name="modelProfile" checked={value?.profile === item.id}
          disabled={!options.enabled.includes(item.model)} onChange={() => onChange({ mode: "preset", profile: item.id })} />
        <strong>{t(item.id === "economical" ? "Economical" : item.id === "balanced" ? "Balanced profile" : "Advanced profile")} · {options.models[item.model].name}</strong>
        {item.id === "balanced" && <small>{t("Recommended")}</small>}
        <span>{t(item.use)}</span><small>{t(item.cost)}</small>
        {!options.enabled.includes(item.model) && <small>{t("Operator enablement required")}</small>}
      </label>)}
    </div>
    <p className="muted">{t("A stronger model or higher reasoning level does not always produce a better answer. Some tasks may take longer and cost more.")}</p>
    {value && value.mode !== "product" && <details>
      <summary>{t("Advanced Settings")}{value.mode === "custom" ? ` · ${t("Customized")}` : ""}</summary>
      <label>{t("Model")}
        <select value={selectedModel} onChange={(event) => { const model = event.target.value as ModelId;
          const efforts = options.models[model].efforts;
          const current = value.mode === "custom" ? value.reasoningEffort : options.models[selectedModel!].defaultEffort;
          const reasoningEffort = (efforts.includes(current) ? current : options.models[model].defaultEffort) as "none" | "low" | "medium" | "high" | "xhigh" | "max";
          setAdjustment(reasoningEffort === current ? "" : t("Reasoning level changed to the selected model default."));
          onChange({ mode: "custom", profile: value.profile, model, reasoningEffort, processingTier: "default" });
        }}>
          {profiles.map((item) => <option key={item.model} value={item.model} disabled={!options.enabled.includes(item.model)}>{options.models[item.model].name}</option>)}
        </select>
      </label>
      {adjustment && <p role="status">{adjustment}</p>}
      {capability && <><label>{t("Reasoning level")}
        <select value={value.mode === "custom" ? value.reasoningEffort : capability.defaultEffort}
          onChange={(event) => onChange({ mode: "custom", profile: value.profile, model: selectedModel!,
            reasoningEffort: event.target.value as "none" | "low" | "medium" | "high" | "xhigh" | "max", processingTier: "default" })}>
          {capability.efforts.map((effort) => <option key={effort} value={effort}
            disabled={effortOrder.indexOf(effort) > effortOrder.indexOf(options.maxReasoningEffort)}>{t(effort)}</option>)}
        </select></label>
        <p className="muted">{t("Higher reasoning can help with complex tasks, but may increase latency and token use. It does not guarantee better answers.")}</p>
        <label>{t("Processing speed")}<select value="default" disabled><option value="default">{t("Standard")}</option></select></label>
        <p className="muted">{t("Faster processing can reduce latency but may cost more. Actual speed varies with load and request complexity.")}</p>
        <p className="muted">{t("Standard text rates per million tokens")}: ${ (capability.prices.input / 1_000_000).toFixed(2) } {t("input")}, ${ (capability.prices.output / 1_000_000).toFixed(2) } {t("output")}. {t("Estimated only; actual usage varies.")}</p>
        <small>{t("Pricing reviewed")}: {options.pricingVersion}</small>
      </>}
      {value.mode === "custom" && <button type="button" className="secondary" onClick={() => onChange({ mode: "preset", profile: value.profile })}>{t("Reset to profile defaults")}</button>}
    </details>}
  </fieldset>;
}
