export type PlcPlatform =
  | "siemens"
  | "rockwell"
  | "schneider"
  | "abb"
  | "mitsubishi"
  | "generic"
  | "custom";

export type ChannelType = "DI" | "DO" | "AI" | "AO";

export const PLC_PLATFORM_LABELS: Record<PlcPlatform, string> = {
  siemens: "Siemens S7",
  rockwell: "Rockwell / Allen-Bradley",
  schneider: "Schneider Electric",
  abb: "ABB",
  mitsubishi: "Mitsubishi",
  generic: "Generic",
  custom: "Custom",
};

export const PLC_PLATFORMS = Object.keys(PLC_PLATFORM_LABELS) as PlcPlatform[];

interface AddressParams {
  rack: number;
  slot: number;
  channelType: ChannelType;
  channelNumber: number;
}

interface CustomConfig {
  prefix?: string | null;
  pattern?: string | null;
}

// Siemens S7: %I0.0, %Q0.0, %IW0, %QW0
function siemensAddress({ rack, slot, channelType, channelNumber }: AddressParams): string {
  const typeCode =
    channelType === "DI" ? "I"
    : channelType === "DO" ? "Q"
    : channelType === "AI" ? "IW"
    : "QW";
  const isAnalog = channelType === "AI" || channelType === "AO";
  const rackOffset = rack * 128;
  const byteOffset = isAnalog
    ? rackOffset + slot * 16 + channelNumber * 2
    : rackOffset + slot * 8;
  const bitAddress = isAnalog ? "" : `.${channelNumber}`;
  return `%${typeCode}${byteOffset}${bitAddress}`;
}

// Rockwell: I:0/0, O:0/0 (digital), I:0.0, O:0.0 (analog)
function rockwellAddress({ slot, channelType, channelNumber }: AddressParams): string {
  const isInput = channelType === "DI" || channelType === "AI";
  const isAnalog = channelType === "AI" || channelType === "AO";
  const prefix = isInput ? "I" : "O";
  if (isAnalog) {
    return `${prefix}:${slot}.${channelNumber}`;
  }
  return `${prefix}:${slot}/${channelNumber}`;
}

// Schneider: %I0.0.0, %Q0.0.0 (rack.module.channel)
function schneiderAddress({ rack, slot, channelType, channelNumber }: AddressParams): string {
  const typeCode =
    channelType === "DI" ? "I"
    : channelType === "DO" ? "Q"
    : channelType === "AI" ? "IW"
    : "QW";
  return `%${typeCode}${rack}.${slot}.${channelNumber}`;
}

// ABB: DI:0:0:0, DO:0:0:0 (rack:slot:channel)
function abbAddress({ rack, slot, channelType, channelNumber }: AddressParams): string {
  return `${channelType}:${rack}:${slot}:${channelNumber}`;
}

// Mitsubishi: X000, Y000 (digital), D000, R000 (analog) — hex-based for digital
function mitsubishiAddress({ slot, channelType, channelNumber }: AddressParams): string {
  const addr = slot * 16 + channelNumber;
  if (channelType === "DI") return `X${addr.toString(16).toUpperCase().padStart(3, "0")}`;
  if (channelType === "DO") return `Y${addr.toString(16).toUpperCase().padStart(3, "0")}`;
  if (channelType === "AI") return `D${addr.toString().padStart(3, "0")}`;
  return `R${addr.toString().padStart(3, "0")}`;
}

// Generic: DI-001, DO-001, AI-001, AO-001
function genericAddress({ slot, channelType, channelNumber }: AddressParams): string {
  const seq = slot * 100 + channelNumber + 1;
  return `${channelType}-${seq.toString().padStart(3, "0")}`;
}

// Custom: user-defined prefix + sequential number
// Pattern placeholders: {TYPE}, {RACK}, {SLOT}, {CH}, {SEQ}
function customAddress(
  params: AddressParams,
  config: CustomConfig
): string {
  const prefix = config.prefix ?? "";
  const pattern = config.pattern ?? "{TYPE}-{SEQ}";
  const seq = params.slot * 100 + params.channelNumber + 1;
  return (
    prefix +
    pattern
      .replace("{TYPE}", params.channelType)
      .replace("{RACK}", String(params.rack))
      .replace("{SLOT}", String(params.slot))
      .replace("{CH}", String(params.channelNumber))
      .replace("{SEQ}", seq.toString().padStart(3, "0"))
  );
}

export function computePlcAddress(
  platform: PlcPlatform,
  params: AddressParams,
  customConfig?: CustomConfig
): string {
  switch (platform) {
    case "siemens":
      return siemensAddress(params);
    case "rockwell":
      return rockwellAddress(params);
    case "schneider":
      return schneiderAddress(params);
    case "abb":
      return abbAddress(params);
    case "mitsubishi":
      return mitsubishiAddress(params);
    case "generic":
      return genericAddress(params);
    case "custom":
      return customAddress(params, customConfig ?? {});
  }
}

/** Example address for display purposes */
export function exampleAddress(platform: PlcPlatform, customConfig?: CustomConfig): string {
  return computePlcAddress(
    platform,
    { rack: 0, slot: 1, channelType: "DI", channelNumber: 0 },
    customConfig
  );
}
