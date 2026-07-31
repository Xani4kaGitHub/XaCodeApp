const api = window.xacode;
const $ = (selector) => document.querySelector(selector);
window.addEventListener('error', (e) => { console.error(e); document.body.innerHTML = '<div style="color:red; background:#fff; padding:20px; z-index:999999; position:absolute; inset:0; font-family:monospace; font-size:16px;"><h1>CRASH LOG ERROR</h1><pre>' + (e.error?.stack || e.message) + '</pre></div>'; });
window.addEventListener('unhandledrejection', (e) => { console.error(e); document.body.innerHTML = '<div style="color:red; background:#fff; padding:20px; z-index:999999; position:absolute; inset:0; font-family:monospace; font-size:16px;"><h1>CRASH LOG REJECTION</h1><pre>' + (e.reason?.stack || String(e.reason)) + '</pre></div>'; });
function readLocalJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    const valid = Array.isArray(fallback)
      ? Array.isArray(value)
      : fallback && typeof fallback === 'object'
        ? Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        : typeof value === typeof fallback;
    return valid ? value : fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

const state = {
  settings: null,
  conversations: [],
  activeId: null,
  workspace: '',
  runningIds: new Set(),
  pendingChoiceId: null,
  pendingChoiceConversationId: null,
  pendingChoiceQuestion: '',
  pendingChoiceOptions: [],
  pendingChoiceSelection: '',
  settingsPage: 'general',
  permissionScope: 'project',
  view: 'conversation',
  navigation: ['conversation'],
  navigationIndex: 0,
  historyStatuses: { running: true, complete: true, archived: true },
  attachments: [],
  sidebarWidth: Number(localStorage.getItem('xacode.sidebarWidth')) || 314,
  sidebarWidthBeforeCollapse: Number(localStorage.getItem('xacode.sidebarWidth')) || 314,
  resizingSidebar: false,
  workspaceLaunchers: [],
  availableTools: [],
  showAllProjects: false,
  projectAliases: readLocalJson('xacode.projectAliases', {}),
  collapsedProjects: readLocalJson('xacode.collapsedProjects', {}),
  pinnedProjects: readLocalJson('xacode.pinnedProjects', []),
  projectOrder: readLocalJson('xacode.projectOrder', []),
  chatOrder: readLocalJson('xacode.chatOrder', {}),
  hoverTimer: null,
  confirmResolve: null,
  editingProfileId: null,
  modelIconVisibleCount: 48,
  editingInstructionId: null,
  settingsSnapshot: null,
  notifiedRuns: new Set(),
  updateState: { status: 'idle', currentVersion: '1.11.4' },
  teamRoomCollapsed: localStorage.getItem('xacode.teamRoomCollapsed') === 'true',
};

// ─── Theme System ────────────────────────────────────────────────────────────
const BUILTIN_THEMES = [
  {id: "xacode",name: "XaCode",variant: "dark",codeThemeId: "xacode",builtin: true,theme: {accent: "#7896e8",accentHover: "#8ea9f0",accentStrong: "#b3c7fa",surface: "#0d0e10",bgApp: "#0d0e10",bgPanel: "#131416",bgPanel2: "#191a1d",bgPanel3: "#202124",borderLine: "#292b2f",borderLineSoft: "#202226",textPrimary: "#eceef2",textMuted: "#8a8f98",textFaint: "#5e636c",ink: "#eceef2",contrast: 60,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#3fb950",diffRemoved: "#d9534f",skill: "#b8c8ff"}}},
  {id: "oled",name: "OLED Pitch Black",variant: "dark",codeThemeId: "xacode",builtin: true,theme: {accent: "#ffffff",accentHover: "#e0e0e0",accentStrong: "#ffffff",surface: "#000000",bgApp: "#000000",bgPanel: "#0a0a0a",bgPanel2: "#121212",bgPanel3: "#1a1a1a",borderLine: "#222222",borderLineSoft: "#141414",textPrimary: "#ffffff",textMuted: "#888888",textFaint: "#555555",ink: "#ffffff",contrast: 60,opaqueWindows: true,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#3fb950",diffRemoved: "#d9534f",skill: "#b8c8ff"}}},
  {id: "zinc",name: "Zinc Dark",variant: "dark",codeThemeId: "github",builtin: true,theme: {accent: "#3b82f6",accentHover: "#60a5fa",accentStrong: "#93c5fd",surface: "#09090b",bgApp: "#09090b",bgPanel: "#18181b",bgPanel2: "#27272a",bgPanel3: "#3f3f46",borderLine: "#27272a",borderLineSoft: "#18181b",textPrimary: "#fafafa",textMuted: "#a1a1aa",textFaint: "#71717a",ink: "#fafafa",contrast: 60,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#22c55e",diffRemoved: "#ef4444",skill: "#a855f7"}}},
  {id: "catppuccin",name: "Catppuccin",variant: "dark",codeThemeId: "catppuccin",builtin: true,theme: {accent: "#CBA6F7",surface: "#1E1E2E",ink: "#CDD6F4",contrast: 60,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#a6e3a1",diffRemoved: "#f38ba8",skill: "#cba6f7"},bgApp: "#1E1E2E",bgPanel: "#272736",bgPanel2: "#2e2e3d",bgPanel3: "#353543",borderLineSoft: "#393947",borderLine: "#42424f",textPrimary: "#CDD6F4",textMuted: "#9096af",textFaint: "#6d7187",accentHover: "#d3b3f8",accentStrong: "#dbc1f9"}},
  {id: "codex",name: "Codex",variant: "dark",codeThemeId: "codex",builtin: true,theme: {accent: "#0169CC",surface: "#111111",ink: "#FCFCFC",contrast: 59,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#00a240",diffRemoved: "#e02e2a",skill: "#751ed9"},bgApp: "#111111",bgPanel: "#1b1b1b",bgPanel2: "#222222",bgPanel3: "#292929",borderLineSoft: "#2e2e2e",borderLine: "#373737",textPrimary: "#FCFCFC",textMuted: "#aaaaaa",textFaint: "#7b7b7b",accentHover: "#2780d4",accentStrong: "#4d96db"}},
  {id: "vscode-plus",name: "VS Code Plus",variant: "dark",codeThemeId: "vscode-plus",builtin: true,theme: {accent: "#007ACC",surface: "#1E1E1E",ink: "#D4D4D4",contrast: 59,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#008000",diffRemoved: "#ee0000",skill: "#0000ff"},bgApp: "#1E1E1E",bgPanel: "#272727",bgPanel2: "#2e2e2e",bgPanel3: "#353535",borderLineSoft: "#393939",borderLine: "#424242",textPrimary: "#D4D4D4",textMuted: "#949494",textFaint: "#707070",accentHover: "#268ed4",accentStrong: "#4da2db"}},
  {id: "github",name: "GitHub",variant: "dark",codeThemeId: "github",builtin: true,theme: {accent: "#1f6feb",surface: "#0d1117",ink: "#e6edf3",contrast: 59,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#3fb950",diffRemoved: "#f85149",skill: "#bc8cff"},bgApp: "#0d1117",bgPanel: "#171b20",bgPanel2: "#1e2227",bgPanel3: "#25292e",borderLineSoft: "#2a2e33",borderLine: "#34373c",textPrimary: "#e6edf3",textMuted: "#9aa0a6",textFaint: "#6f747a",accentHover: "#4185ee",accentStrong: "#629af1"}},
  {id: "ayu",name: "Ayu",variant: "dark",codeThemeId: "ayu",builtin: true,theme: {accent: "#e6b450",surface: "#10141c",ink: "#bfbdb6",contrast: 59,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#70bf56",diffRemoved: "#f26d78",skill: "#d0a1ff"},bgApp: "#10141c",bgPanel: "#1a1d25",bgPanel2: "#21242c",bgPanel3: "#282c33",borderLineSoft: "#2d3037",borderLine: "#363a40",textPrimary: "#bfbdb6",textMuted: "#828280",textFaint: "#5f6061",accentHover: "#eabf6a",accentStrong: "#eecb85"}},
  {id: "absolutely",name: "Absolutely",variant: "dark",codeThemeId: "absolutely",builtin: true,theme: {accent: "#cc7d5e",surface: "#2d2d2b",ink: "#f9f9f7",contrast: 59,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#00c853",diffRemoved: "#ff5f38",skill: "#cc7d5e"},bgApp: "#2d2d2b",bgPanel: "#353533",bgPanel2: "#3c3c3a",bgPanel3: "#424240",borderLineSoft: "#464644",borderLine: "#4f4f4d",textPrimary: "#f9f9f7",textMuted: "#b2b2b0",textFaint: "#898987",accentHover: "#d49176",accentStrong: "#dba48e"}},
  {id: "everforest",name: "Everforest",variant: "dark",codeThemeId: "everforest",builtin: true,theme: {accent: "#a7c080",surface: "#2d353b",ink: "#d3c6aa",contrast: 59,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#a7c080",diffRemoved: "#e67e80",skill: "#d699b6"},bgApp: "#2d353b",bgPanel: "#353d43",bgPanel2: "#3c4349",bgPanel3: "#42494f",borderLineSoft: "#464d53",borderLine: "#4f555a",textPrimary: "#d3c6aa",textMuted: "#999383",textFaint: "#78766d",accentHover: "#b4c993",accentStrong: "#c1d3a6"}},
  {id: "gruvbox",name: "Gruvbox",variant: "dark",codeThemeId: "gruvbox",builtin: true,theme: {accent: "#458588",surface: "#282828",ink: "#ebdbb2",contrast: 59,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#ebdbb2",diffRemoved: "#cc241d",skill: "#b16286"},bgApp: "#282828",bgPanel: "#313131",bgPanel2: "#373737",bgPanel3: "#3e3e3e",borderLineSoft: "#424242",borderLine: "#4a4a4a",textPrimary: "#ebdbb2",textMuted: "#a79c82",textFaint: "#807966",accentHover: "#61979a",accentStrong: "#7daaac"}},
  {id: "linear",name: "Linear",variant: "dark",codeThemeId: "linear",builtin: true,theme: {accent: "#606acc",surface: "#0f0f11",ink: "#e3e4e6",contrast: 59,opaqueWindows: true,fonts: {ui: "Inter",code: null},semanticColors: {diffAdded: "#69c967",diffRemoved: "#ff7e78",skill: "#c2a1ff"},bgApp: "#0f0f11",bgPanel: "#19191b",bgPanel2: "#202022",bgPanel3: "#272729",borderLineSoft: "#2c2c2e",borderLine: "#353537",textPrimary: "#e3e4e6",textMuted: "#99999b",textFaint: "#6e6f71",accentHover: "#7880d4",accentStrong: "#9097db"}},
  {id: "lobster",name: "Lobster",variant: "dark",codeThemeId: "lobster",builtin: true,theme: {accent: "#ff5c5c",surface: "#111827",ink: "#e4e4e7",contrast: 59,opaqueWindows: true,fonts: {ui: "Satoshi",code: null},semanticColors: {diffAdded: "#22c55e",diffRemoved: "#ff5c5c",skill: "#3b82f6"},bgApp: "#111827",bgPanel: "#1b2130",bgPanel2: "#222836",bgPanel3: "#292f3d",borderLineSoft: "#2e3441",borderLine: "#373d4a",textPrimary: "#e4e4e7",textMuted: "#9a9da4",textFaint: "#70747d",accentHover: "#ff7474",accentStrong: "#ff8d8d"}},
  {id: "material",name: "Material",variant: "dark",codeThemeId: "material",builtin: true,theme: {accent: "#80cbc4",surface: "#212121",ink: "#eeffff",contrast: 59,opaqueWindows: true,fonts: {ui: "Satoshi",code: null},semanticColors: {diffAdded: "#c3e88d",diffRemoved: "#f07178",skill: "#c792ea"},bgApp: "#212121",bgPanel: "#2a2a2a",bgPanel2: "#313131",bgPanel3: "#373737",borderLineSoft: "#3c3c3c",borderLine: "#454545",textPrimary: "#eeffff",textMuted: "#a6b1b1",textFaint: "#7d8585",accentHover: "#93d3cd",accentStrong: "#a6dbd6"}},
  {id: "matrix",name: "Matrix",variant: "dark",codeThemeId: "matrix",builtin: true,theme: {accent: "#1eff5a",surface: "#040805",ink: "#b8ffca",contrast: 59,opaqueWindows: true,fonts: {ui: "ui-monospace, \"SFMono-Regular\", \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace",code: null},semanticColors: {diffAdded: "#1eff5a",diffRemoved: "#fa423e",skill: "#1eff5a"},bgApp: "#040805",bgPanel: "#0e120f",bgPanel2: "#161917",bgPanel3: "#1d211e",borderLineSoft: "#222623",borderLine: "#2c302d",textPrimary: "#b8ffca",textMuted: "#79a985",textFaint: "#55775e",accentHover: "#40ff73",accentStrong: "#62ff8c"}},
  {id: "monokai",name: "Monokai",variant: "dark",codeThemeId: "monokai",builtin: true,theme: {accent: "#99947c",surface: "#272822",ink: "#f8f8f2",contrast: 59,opaqueWindows: true,fonts: {ui: "ui-monospace, \"SFMono-Regular\", \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace",code: null},semanticColors: {diffAdded: "#86b42b",diffRemoved: "#c4265e",skill: "#8c6bc8"},bgApp: "#272822",bgPanel: "#30312b",bgPanel2: "#363731",bgPanel3: "#3d3e38",borderLineSoft: "#41423d",borderLine: "#4a4a45",textPrimary: "#f8f8f2",textMuted: "#afafa9",textFaint: "#858680",accentHover: "#a8a490",accentStrong: "#b8b4a3"}},
  {id: "night-owl",name: "Night Owl",variant: "dark",codeThemeId: "night-owl",builtin: true,theme: {accent: "#44596b",surface: "#011627",ink: "#d6deeb",contrast: 59,opaqueWindows: true,fonts: {ui: "ui-monospace, \"SFMono-Regular\", \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace",code: null},semanticColors: {diffAdded: "#c5e478",diffRemoved: "#ef5350",skill: "#c792ea"},bgApp: "#011627",bgPanel: "#0b1f30",bgPanel2: "#132636",bgPanel3: "#1a2d3d",borderLineSoft: "#1f3241",borderLine: "#2a3b4a",textPrimary: "#d6deeb",textMuted: "#8b98a6",textFaint: "#61707f",accentHover: "#607281",accentStrong: "#7c8b97"}},
  {id: "nord",name: "Nord",variant: "dark",codeThemeId: "nord",builtin: true,theme: {accent: "#88c0d0",surface: "#2e3440",ink: "#d8dee9",contrast: 59,opaqueWindows: true,fonts: {ui: "ui-monospace, \"SFMono-Regular\", \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace",code: null},semanticColors: {diffAdded: "#a3be8c",diffRemoved: "#bf616a",skill: "#b48ead"},bgApp: "#2e3440",bgPanel: "#363c48",bgPanel2: "#3d424d",bgPanel3: "#434853",borderLineSoft: "#474c57",borderLine: "#4f545f",textPrimary: "#d8dee9",textMuted: "#9da3ae",textFaint: "#7a818c",accentHover: "#9ac9d7",accentStrong: "#acd3de"}},
  {id: "notion",name: "Notion",variant: "dark",codeThemeId: "notion",builtin: true,theme: {accent: "#3183d8",surface: "#191919",ink: "#d9d9d8",contrast: 59,opaqueWindows: true,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#4ec9b0",diffRemoved: "#fa423e",skill: "#3183d8"},bgApp: "#191919",bgPanel: "#222222",bgPanel2: "#292929",bgPanel3: "#303030",borderLineSoft: "#353535",borderLine: "#3e3e3e",textPrimary: "#d9d9d8",textMuted: "#969695",textFaint: "#6f6f6f",accentHover: "#5096de",accentStrong: "#6fa8e4"}},
  {id: "one",name: "One",variant: "dark",codeThemeId: "one",builtin: true,theme: {accent: "#4d78cc",surface: "#282c34",ink: "#abb2bf",contrast: 59,opaqueWindows: true,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#8cc265",diffRemoved: "#e05561",skill: "#c162de"},bgApp: "#282c34",bgPanel: "#31343c",bgPanel2: "#373b42",bgPanel3: "#3e4148",borderLineSoft: "#42454c",borderLine: "#4a4e54",textPrimary: "#abb2bf",textMuted: "#7d838e",textFaint: "#636873",accentHover: "#688cd4",accentStrong: "#82a1db"}},
  {id: "oscurange",name: "Oscurange",variant: "dark",codeThemeId: "oscurange",builtin: true,theme: {accent: "#f9b98c",surface: "#0b0b0f",ink: "#e6e6e6",contrast: 59,opaqueWindows: true,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#40c977",diffRemoved: "#fa423e",skill: "#479ffa"},bgApp: "#0b0b0f",bgPanel: "#151519",bgPanel2: "#1c1c20",bgPanel3: "#232327",borderLineSoft: "#28282c",borderLine: "#323235",textPrimary: "#e6e6e6",textMuted: "#99999b",textFaint: "#6e6e70",accentHover: "#fac49d",accentStrong: "#fbceaf"}},
  {id: "sentry",name: "Sentry",variant: "dark",codeThemeId: "sentry",builtin: true,theme: {accent: "#7055f6",surface: "#2d2935",ink: "#e6dff9",contrast: 59,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#8ee6d7",diffRemoved: "#fa423e",skill: "#7055f6"},bgApp: "#2d2935",bgPanel: "#35323d",bgPanel2: "#3c3843",bgPanel3: "#423e49",borderLineSoft: "#46434d",borderLine: "#4f4b55",textPrimary: "#e6dff9",textMuted: "#a59fb4",textFaint: "#807b8d",accentHover: "#856ff7",accentStrong: "#9b88f9"}},
  {id: "tokyo-night",name: "Tokyo Night",variant: "dark",codeThemeId: "tokyo-night",builtin: true,theme: {accent: "#3d59a1",surface: "#1a1b26",ink: "#a9b1d6",contrast: 59,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#449dab",diffRemoved: "#914c54",skill: "#9d7cd8"},bgApp: "#1a1b26",bgPanel: "#23242f",bgPanel2: "#2a2b35",bgPanel3: "#31323c",borderLineSoft: "#353640",borderLine: "#3f3f49",textPrimary: "#a9b1d6",textMuted: "#777d98",textFaint: "#5a5f75",accentHover: "#5a72af",accentStrong: "#778bbd"}},
  {id: "vercel",name: "Vercel",variant: "dark",codeThemeId: "vercel",builtin: true,theme: {accent: "#006efe",surface: "#000000",ink: "#ededed",contrast: 50,opaqueWindows: true,fonts: {code: "\"Geist Mono\", ui-monospace, \"SFMono-Regular\"",ui: "Geist, Inter"},semanticColors: {diffAdded: "#00AD3A",diffRemoved: "#F13342",skill: "#9540D5"},bgApp: "#000000",bgPanel: "#0a0a0a",bgPanel2: "#121212",bgPanel3: "#1a1a1a",borderLineSoft: "#1f1f1f",borderLine: "#292929",textPrimary: "#ededed",textMuted: "#9a9a9a",textFaint: "#6b6b6b",accentHover: "#2684fe",accentStrong: "#4d9afe"}},
  {id: "absolutely",name: "Absolutely",variant: "light",codeThemeId: "absolutely",builtin: true,theme: {accent: "#cc7d5e",surface: "#f9f9f7",ink: "#2d2d2b",contrast: 45,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#00c853",diffRemoved: "#ff5f38",skill: "#cc7d5e"},bgApp: "#f9f9f7",bgPanel: "#f4f4f2",bgPanel2: "#efefed",bgPanel3: "#eaeae8",borderLineSoft: "#e5e5e3",borderLine: "#dbdbd9",textPrimary: "#2d2d2b",textMuted: "#747472",textFaint: "#9d9d9b",accentHover: "#ad6a50",accentStrong: "#8f5842"}},
  {id: "catppuccin",name: "Catppuccin",variant: "light",codeThemeId: "catppuccin",builtin: true,theme: {accent: "#8839ef",surface: "#eff1f5",ink: "#4c4f69",contrast: 45,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#40a02b",diffRemoved: "#d20f39",skill: "#8839ef"},bgApp: "#eff1f5",bgPanel: "#eaecf0",bgPanel2: "#e5e7eb",bgPanel3: "#e1e3e6",borderLineSoft: "#dcdee1",borderLine: "#d2d4d8",textPrimary: "#4c4f69",textMuted: "#85889a",textFaint: "#a6a8b6",accentHover: "#7430cb",accentStrong: "#5f28a7"}},
  {id: "codex",name: "Codex",variant: "light",codeThemeId: "codex",builtin: true,theme: {accent: "#0169cc",surface: "#ffffff",ink: "#0d0d0d",contrast: 45,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#00a240",diffRemoved: "#e02e2a",skill: "#751ed9"},bgApp: "#ffffff",bgPanel: "#fafafa",bgPanel2: "#f5f5f5",bgPanel3: "#f0f0f0",borderLineSoft: "#ebebeb",borderLine: "#e0e0e0",textPrimary: "#0d0d0d",textMuted: "#626262",textFaint: "#929292",accentHover: "#0159ad",accentStrong: "#014a8f"}},
  {id: "everforest",name: "Everforest",variant: "light",codeThemeId: "everforest",builtin: true,theme: {accent: "#93b259",surface: "#fdf6e3",ink: "#5c6a72",contrast: 45,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#8da101",diffRemoved: "#f85552",skill: "#df69ba"},bgApp: "#fdf6e3",bgPanel: "#f8f1de",bgPanel2: "#f3ecda",bgPanel3: "#eee7d5",borderLineSoft: "#e9e2d1",borderLine: "#dfd8c8",textPrimary: "#5c6a72",textMuted: "#949b9a",textFaint: "#b5b7b0",accentHover: "#7d974c",accentStrong: "#677d3e"}},
  {id: "github",name: "GitHub",variant: "light",codeThemeId: "github",builtin: true,theme: {accent: "#0969da",surface: "#ffffff",ink: "#1f2328",contrast: 45,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#1a7f37",diffRemoved: "#cf222e",skill: "#8250df"},bgApp: "#ffffff",bgPanel: "#fafafa",bgPanel2: "#f5f5f5",bgPanel3: "#f0f0f0",borderLineSoft: "#ebebeb",borderLine: "#e0e0e0",textPrimary: "#1f2328",textMuted: "#6d7073",textFaint: "#9a9c9e",accentHover: "#0859b9",accentStrong: "#064a99"}},
  {id: "gruvbox",name: "Gruvbox",variant: "light",codeThemeId: "gruvbox",builtin: true,theme: {accent: "#458588",surface: "#fbf1c7",ink: "#3c3836",contrast: 45,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#3c3836",diffRemoved: "#cc241d",skill: "#b16286"},bgApp: "#fbf1c7",bgPanel: "#f6ecc3",bgPanel2: "#f1e7bf",bgPanel3: "#ece3bb",borderLineSoft: "#e7deb7",borderLine: "#ddd4af",textPrimary: "#3c3836",textMuted: "#7f7969",textFaint: "#a59e86",accentHover: "#3b7174",accentStrong: "#305d5f"}},
  {id: "linear",name: "Linear",variant: "light",codeThemeId: "linear",builtin: true,theme: {accent: "#5e6ad2",surface: "#fcfcfd",ink: "#1b1b1b",contrast: 45,opaqueWindows: true,fonts: {ui: "Inter",code: null},semanticColors: {diffAdded: "#52a450",diffRemoved: "#c94446",skill: "#8160d8"},bgApp: "#fcfcfd",bgPanel: "#f7f7f8",bgPanel2: "#f2f2f3",bgPanel3: "#ededee",borderLineSoft: "#e8e8e9",borderLine: "#dededf",textPrimary: "#1b1b1b",textMuted: "#6a6a6a",textFaint: "#979797",accentHover: "#505ab3",accentStrong: "#424a93"}},
  {id: "notion",name: "Notion",variant: "light",codeThemeId: "notion",builtin: true,theme: {accent: "#3183d8",surface: "#ffffff",ink: "#37352f",contrast: 45,opaqueWindows: true,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#008000",diffRemoved: "#a31515",skill: "#0000ff"},bgApp: "#ffffff",bgPanel: "#fafafa",bgPanel2: "#f5f5f5",bgPanel3: "#f0f0f0",borderLineSoft: "#ebebeb",borderLine: "#e0e0e0",textPrimary: "#37352f",textMuted: "#7d7c78",textFaint: "#a5a4a1",accentHover: "#2a6fb8",accentStrong: "#225c97"}},
  {id: "one",name: "One",variant: "light",codeThemeId: "one",builtin: true,theme: {accent: "#526fff",surface: "#fafafa",ink: "#383a42",contrast: 45,opaqueWindows: true,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#3bba54",diffRemoved: "#e45649",skill: "#526fff"},bgApp: "#fafafa",bgPanel: "#f5f5f5",bgPanel2: "#f0f0f0",bgPanel3: "#ebebeb",borderLineSoft: "#e6e6e6",borderLine: "#dcdcdc",textPrimary: "#383a42",textMuted: "#7c7d82",textFaint: "#a3a4a7",accentHover: "#465ed9",accentStrong: "#394eb3"}},
  {id: "proof",name: "Proof",variant: "light",codeThemeId: "proof",builtin: true,theme: {accent: "#3d755d",surface: "#f5f3ed",ink: "#2f312d",contrast: 45,opaqueWindows: false,fonts: {ui: null,code: null},semanticColors: {diffAdded: "#3d755d",diffRemoved: "#ba2623",skill: "#5f6ac2"},bgApp: "#f5f3ed",bgPanel: "#f0eee8",bgPanel2: "#ebe9e4",bgPanel3: "#e6e4df",borderLineSoft: "#e1e0da",borderLine: "#d8d6d1",textPrimary: "#2f312d",textMuted: "#747570",textFaint: "#9c9c97",accentHover: "#34634f",accentStrong: "#2b5241"}},
  {id: "raycast",name: "Raycast",variant: "light",codeThemeId: "raycast",builtin: true,theme: {accent: "#ff6363",surface: "#ffffff",ink: "#030303",contrast: 45,opaqueWindows: false,fonts: {code: "\"Jetbrains Mono\"",ui: "Inter"},semanticColors: {diffAdded: "#006b4f",diffRemoved: "#b12424",skill: "#9a1b6e"},bgApp: "#ffffff",bgPanel: "#fafafa",bgPanel2: "#f5f5f5",bgPanel3: "#f0f0f0",borderLineSoft: "#ebebeb",borderLine: "#e0e0e0",textPrimary: "#030303",textMuted: "#5b5b5b",textFaint: "#8e8e8e",accentHover: "#d95454",accentStrong: "#b34545"}},
  {id: "rose-pine",name: "Rosé Pine",variant: "light",codeThemeId: "rose-pine",builtin: true,theme: {accent: "#d7827e",surface: "#faf4ed",ink: "#575279",contrast: 45,opaqueWindows: false,fonts: {code: "\"Jetbrains Mono\"",ui: "Inter"},semanticColors: {diffAdded: "#56949f",diffRemoved: "#797593",skill: "#907aa9"},bgApp: "#faf4ed",bgPanel: "#f5efe8",bgPanel2: "#f0eae4",bgPanel3: "#ebe5df",borderLineSoft: "#e6e0da",borderLine: "#dcd7d1",textPrimary: "#575279",textMuted: "#908ba2",textFaint: "#b1abb9",accentHover: "#b76f6b",accentStrong: "#975b58"}},
  {id: "solarized",name: "Solarized",variant: "light",codeThemeId: "solarized",builtin: true,theme: {accent: "#b58900",surface: "#fdf6e3",ink: "#657b83",contrast: 45,opaqueWindows: false,fonts: {code: "\"Jetbrains Mono\"",ui: "Inter"},semanticColors: {diffAdded: "#859900",diffRemoved: "#dc322f",skill: "#d33682"},bgApp: "#fdf6e3",bgPanel: "#f8f1de",bgPanel2: "#f3ecda",bgPanel3: "#eee7d5",borderLineSoft: "#e9e2d1",borderLine: "#dfd8c8",textPrimary: "#657b83",textMuted: "#9aa6a5",textFaint: "#b9bfb8",accentHover: "#9a7400",accentStrong: "#7f6000"}},
  {id: "vercel",name: "Vercel",variant: "light",codeThemeId: "vercel",builtin: true,theme: {accent: "#006aff",surface: "#ffffff",ink: "#171717",contrast: 40,opaqueWindows: true,fonts: {code: "\"Geist Mono\", ui-monospace, \"SFMono-Regular\"",ui: "Geist, Inter"},semanticColors: {diffAdded: "#28A948",diffRemoved: "#EB001D",skill: "#A100F8"},bgApp: "#ffffff",bgPanel: "#fafafa",bgPanel2: "#f5f5f5",bgPanel3: "#f0f0f0",borderLineSoft: "#ebebeb",borderLine: "#e0e0e0",textPrimary: "#171717",textMuted: "#686868",textFaint: "#979797",accentHover: "#005ad9",accentStrong: "#004ab3"}},
  {id: "vscode-plus",name: "VS Code Plus",variant: "light",codeThemeId: "vscode-plus",builtin: true,theme: {accent: "#007acc",surface: "#ffffff",ink: "#000000",contrast: 40,opaqueWindows: true,fonts: {code: "\"Geist Mono\", ui-monospace, \"SFMono-Regular\"",ui: "Geist, Inter"},semanticColors: {diffAdded: "#008000",diffRemoved: "#ee0000",skill: "#0000ff"},bgApp: "#ffffff",bgPanel: "#fafafa",bgPanel2: "#f5f5f5",bgPanel3: "#f0f0f0",borderLineSoft: "#ebebeb",borderLine: "#e0e0e0",textPrimary: "#000000",textMuted: "#595959",textFaint: "#8c8c8c",accentHover: "#0068ad",accentStrong: "#00558f"}},
];

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}
function shiftColor(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const factor = amount > 0 ? 255 : 0;
  const abs = Math.abs(amount) / 100;
  return rgbToHex(r + (factor - r) * abs, g + (factor - g) * abs, b + (factor - b) * abs);
}
function blendColor(hex1, hex2, ratio) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(r1 + (r2 - r1) * ratio, g1 + (g2 - g1) * ratio, b1 + (b2 - b1) * ratio);
}

// HSV utilities for custom color picker
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0, s = mx === 0 ? 0 : d / mx, v = mx;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, v * 100];
}
function hsvToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function hexToHsv(hex) { const [r, g, b] = hexToRgb(hex); return rgbToHsv(r, g, b); }
function hsvToHex(h, s, v) { const [r, g, b] = hsvToRgb(h, s, v); return rgbToHex(r, g, b); }

// ─── Custom Color Picker ────────────────────────────────────────────────────
const _xcp = { open: false, target: null, h: 0, s: 100, v: 100, callback: null };

function xcpRenderGradient() {
  const canvas = document.getElementById('xcpGradient');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  // Base hue layer
  const [r, g, b] = hsvToRgb(_xcp.h, 100, 100);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, w, h);
  // White gradient left-to-right
  const gWhite = ctx.createLinearGradient(0, 0, w, 0);
  gWhite.addColorStop(0, 'rgba(255,255,255,1)');
  gWhite.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gWhite;
  ctx.fillRect(0, 0, w, h);
  // Black gradient top-to-bottom
  const gBlack = ctx.createLinearGradient(0, 0, 0, h);
  gBlack.addColorStop(0, 'rgba(0,0,0,0)');
  gBlack.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = gBlack;
  ctx.fillRect(0, 0, w, h);
}

function xcpRenderHue() {
  const canvas = document.getElementById('xcpHue');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function xcpUpdateCursors() {
  const gc = document.getElementById('xcpGradientCursor');
  const hc = document.getElementById('xcpHueCursor');
  const gCanvas = document.getElementById('xcpGradient');
  const hCanvas = document.getElementById('xcpHue');
  if (gc && gCanvas) {
    gc.style.left = (_xcp.s / 100 * gCanvas.width) + 'px';
    gc.style.top = ((1 - _xcp.v / 100) * gCanvas.height) + 'px';
  }
  if (hc && hCanvas) {
    hc.style.left = (_xcp.h / 360 * hCanvas.width) + 'px';
  }
}

function xcpEmitColor() {
  const hex = hsvToHex(_xcp.h, _xcp.s, _xcp.v);
  const hexInput = document.getElementById('xcpHexInput');
  if (hexInput) hexInput.value = hex.toUpperCase();
  if (_xcp.callback) _xcp.callback(hex);
}

function openColorPicker(swatchEl, initialColor, callback) {
  const picker = document.getElementById('xacodeColorPicker');
  if (!picker) return;
  _xcp.callback = callback;
  const [h, s, v] = hexToHsv(initialColor);
  _xcp.h = h; _xcp.s = s; _xcp.v = v;
  // Position near swatch
  const rect = swatchEl.getBoundingClientRect();
  picker.style.top = (rect.bottom + 8) + 'px';
  picker.style.left = Math.max(8, rect.right - 254) + 'px';
  picker.classList.add('open');
  _xcp.open = true;
  xcpRenderGradient();
  xcpRenderHue();
  xcpUpdateCursors();
  const hexInput = document.getElementById('xcpHexInput');
  if (hexInput) hexInput.value = initialColor.toUpperCase();
}

function closeColorPicker() {
  const picker = document.getElementById('xacodeColorPicker');
  if (picker) picker.classList.remove('open');
  _xcp.open = false;
  _xcp.callback = null;
}

function xcpBindEvents() {
  const gCanvas = document.getElementById('xcpGradient');
  const hCanvas = document.getElementById('xcpHue');
  const hexInput = document.getElementById('xcpHexInput');
  if (!gCanvas || !hCanvas) return;

  function handleGradient(e) {
    const r = gCanvas.getBoundingClientRect();
    _xcp.s = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100));
    _xcp.v = Math.max(0, Math.min(100, (1 - (e.clientY - r.top) / r.height) * 100));
    xcpUpdateCursors();
    xcpEmitColor();
  }
  function handleHue(e) {
    const r = hCanvas.getBoundingClientRect();
    _xcp.h = Math.max(0, Math.min(360, (e.clientX - r.left) / r.width * 360));
    xcpRenderGradient();
    xcpUpdateCursors();
    xcpEmitColor();
  }
  let draggingGradient = false, draggingHue = false;
  gCanvas.addEventListener('mousedown', (e) => { draggingGradient = true; handleGradient(e); });
  hCanvas.addEventListener('mousedown', (e) => { draggingHue = true; handleHue(e); });
  document.addEventListener('mousemove', (e) => {
    if (draggingGradient) handleGradient(e);
    if (draggingHue) handleHue(e);
  });
  document.addEventListener('mouseup', () => { draggingGradient = false; draggingHue = false; });

  if (hexInput) {
    hexInput.addEventListener('input', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        const [h, s, v] = hexToHsv(val);
        _xcp.h = h; _xcp.s = s; _xcp.v = v;
        xcpRenderGradient();
        xcpUpdateCursors();
        if (_xcp.callback) _xcp.callback(val);
      }
    });
  }

  // Close picker on outside click
  document.addEventListener('mousedown', (e) => {
    if (!_xcp.open) return;
    const picker = document.getElementById('xacodeColorPicker');
    if (picker && !picker.contains(e.target) && !e.target.closest('.theme-swatch')) closeColorPicker();
  });
}

// ─── Theme edit utilities ────────────────────────────────────────────────────
function cloneThemeForEdit() {
  if (!state._activeThemePreset) return null;
  if (state._activeThemePreset._cloned) return state._activeThemePreset;
  const clone = JSON.parse(JSON.stringify(state._activeThemePreset));
  clone._cloned = true;
  state._activeThemePreset = clone;
  return clone;
}

function updateThemeColor(key, hex) {
  const preset = cloneThemeForEdit();
  if (!preset) return;
  preset.theme[key] = hex;

  // Clear hardcoded derived colors so they recalculate dynamically
  if (key === 'surface') {
    delete preset.theme.bgPanel;
    delete preset.theme.bgPanel2;
    delete preset.theme.bgPanel3;
    delete preset.theme.borderLine;
    delete preset.theme.borderLineSoft;
  } else if (key === 'accent') {
    delete preset.theme.accentHover;
    delete preset.theme.accentStrong;
  } else if (key === 'ink') {
    delete preset.theme.textMuted;
    delete preset.theme.textFaint;
  }
  
  applyTheme(preset);
  // Update the UI swatch and hex label
  const swatchId = key === 'accent' ? 'themeAccentSwatch' : key === 'surface' ? 'themeSurfaceSwatch' : 'themeInkSwatch';
  const hexId = key === 'accent' ? 'themeAccentHex' : key === 'surface' ? 'themeSurfaceHex' : 'themeInkHex';
  const sw = document.getElementById(swatchId);
  const hl = document.getElementById(hexId);
  if (sw) sw.style.background = hex;
  if (hl) hl.textContent = hex.toUpperCase();
}

function applyTheme(preset) {
  if (!preset || !preset.theme) return;
  const t = preset.theme;
  const root = document.documentElement.style;
  const isLight = preset.variant === 'light';

  const bgApp = t.bgApp || t.surface;
  const textPrimary = t.textPrimary || t.ink;

  root.setProperty('--bg', bgApp);
  root.setProperty('--text', textPrimary);
  root.setProperty('--accent', t.accent);
  
  if (t.accentHover && t.accentStrong) {
    root.setProperty('--accent-hover', t.accentHover);
    root.setProperty('--accent-strong', t.accentStrong);
  } else {
    root.setProperty('--accent-hover', shiftColor(t.accent, isLight ? -10 : 10));
    root.setProperty('--accent-strong', shiftColor(t.accent, isLight ? -25 : 25));
  }
  
  if (t.danger && t.dangerHover) {
    root.setProperty('--danger', t.danger);
    root.setProperty('--danger-hover', t.dangerHover);
  } else {
    root.setProperty('--danger', isLight ? '#c9302c' : '#d9534f');
    root.setProperty('--danger-hover', isLight ? '#a02622' : '#c9302c');
  }

  if (t.bgPanel && t.bgPanel2 && t.bgPanel3) {
    root.setProperty('--panel', t.bgPanel);
    root.setProperty('--panel-2', t.bgPanel2);
    root.setProperty('--panel-3', t.bgPanel3);
  } else {
    const contrast = t.contrast ?? 59;
    const panelShift = isLight ? -4 : 4;
    root.setProperty('--panel', shiftColor(t.surface, panelShift * (contrast / 59)));
    root.setProperty('--panel-2', shiftColor(t.surface, panelShift * 2 * (contrast / 59)));
    root.setProperty('--panel-3', shiftColor(t.surface, panelShift * 3.5 * (contrast / 59)));
  }

  if (t.borderLine && t.borderLineSoft) {
    root.setProperty('--line', t.borderLine);
    root.setProperty('--line-soft', t.borderLineSoft);
  } else {
    const contrast = t.contrast ?? 59;
    root.setProperty('--line', shiftColor(t.surface, (isLight ? -12 : 12) * (contrast / 59)));
    root.setProperty('--line-soft', shiftColor(t.surface, (isLight ? -7 : 7) * (contrast / 59)));
  }

  if (t.textMuted && t.textFaint) {
    root.setProperty('--muted', t.textMuted);
    root.setProperty('--faint', t.textFaint);
  } else {
    root.setProperty('--muted', blendColor(t.ink, t.surface, 0.42));
    root.setProperty('--faint', blendColor(t.ink, t.surface, 0.62));
  }

  document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';

  const scrollThumb = t.bgPanel3 || shiftColor(t.surface, isLight ? -25 : 25);
  const scrollHover = t.borderLine || shiftColor(t.surface, isLight ? -35 : 35);
  let scrollStyle = document.getElementById('xacode-scroll-style');
  if (!scrollStyle) { scrollStyle = document.createElement('style'); scrollStyle.id = 'xacode-scroll-style'; document.head.appendChild(scrollStyle); }
  scrollStyle.textContent = `* { scrollbar-color: ${scrollThumb} transparent; } *::-webkit-scrollbar-thumb { background: ${scrollThumb}; background-clip: padding-box; } *::-webkit-scrollbar-thumb:hover { background: ${scrollHover}; background-clip: padding-box; }`;

  if (t.fonts.ui) {
    document.documentElement.style.fontFamily = t.fonts.ui + ', "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
  } else {
    document.documentElement.style.fontFamily = '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
  }

  localStorage.setItem('xacode.themeVariant', preset.variant);
  localStorage.setItem('xacode.activeThemeId', preset.id);
  state._activeThemePreset = preset;
}

function getAllThemes() {
  return [...BUILTIN_THEMES, ...(state.settings?.customThemes || [])];
}

function getActiveTheme() {
  const variant = state.settings?.themeVariant || localStorage.getItem('xacode.themeVariant') || 'dark';
  const id = state.settings?.activeThemeId || localStorage.getItem('xacode.activeThemeId') || 'xacode';
  return getAllThemes().find(t => t.id === id && t.variant === variant) || BUILTIN_THEMES[0];
}

function fillAppearanceSettings() {
  const variant = state.settings?.themeVariant || 'dark';
  const activeId = state.settings?.activeThemeId || 'xacode';
  const allThemes = getAllThemes();
  const filtered = allThemes.filter(t => t.variant === variant);

  document.querySelectorAll('.theme-variant-tab').forEach(tab =>
    tab.classList.toggle('active', tab.dataset.variant === variant));

  const dropdown = $('#themePresetDropdown');
  if (dropdown) {
    dropdown.innerHTML = filtered.map(t =>
      `<button type="button" class="theme-preset-option${t.id === activeId ? ' active' : ''}" data-theme-id="${t.id}"><span class="theme-preset-swatch" style="background:${t.theme.accent}"></span>${t.name}</button>`
    ).join('');
    dropdown.querySelectorAll('[data-theme-id]').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tid = btn.dataset.themeId;
      // Deep clone the builtin theme so we never mutate the original
      const original = allThemes.find(t => t.id === tid && t.variant === variant);
      if (!original) return;
      const preset = JSON.parse(JSON.stringify(original));
      state.settings.activeThemeId = tid;
      applyTheme(preset);
      fillAppearanceSettings();
      void api.saveSettings(state.settings);
      dropdown.classList.remove('open');
    }));
  }

  const current = state._activeThemePreset || allThemes.find(t => t.id === activeId && t.variant === variant) || filtered[0] || BUILTIN_THEMES[0];
  if ($('#themePresetName')) $('#themePresetName').textContent = current.name;
  // Update swatches
  if ($('#themeAccentSwatch')) $('#themeAccentSwatch').style.background = current.theme.accent;
  if ($('#themeAccentHex')) $('#themeAccentHex').textContent = current.theme.accent.toUpperCase();
  if ($('#themeSurfaceSwatch')) $('#themeSurfaceSwatch').style.background = current.theme.surface;
  if ($('#themeSurfaceHex')) $('#themeSurfaceHex').textContent = current.theme.surface.toUpperCase();
  if ($('#themeInkSwatch')) $('#themeInkSwatch').style.background = current.theme.ink;
  if ($('#themeInkHex')) $('#themeInkHex').textContent = current.theme.ink.toUpperCase();
  if ($('#themeFontUI')) $('#themeFontUI').value = current.theme.fonts.ui || '';
  if ($('#themeFontCode')) $('#themeFontCode').value = current.theme.fonts.code || '';
  if ($('#themeOpaqueWindows')) $('#themeOpaqueWindows').checked = current.theme.opaqueWindows;
  if ($('#themeContrastSlider')) { $('#themeContrastSlider').value = current.theme.contrast; }
  if ($('#themeContrastValue')) $('#themeContrastValue').textContent = current.theme.contrast;
}

function copyThemeString() {
  const current = state._activeThemePreset || getActiveTheme();
  if (!current) return;
  const t = current.theme;
  const exportObj = { codeThemeId: current.codeThemeId, theme: { accent: t.accent, contrast: t.contrast, fonts: t.fonts, ink: t.ink, opaqueWindows: t.opaqueWindows, semanticColors: t.semanticColors, surface: t.surface }, variant: current.variant };
  const str = 'codex-theme-v1:' + JSON.stringify(exportObj);
  navigator.clipboard.writeText(str).then(() => toast('Тема скопирована в буфер обмена')).catch(() => toast('Не удалось скопировать'));
}

function importThemeString() {
  const input = prompt('Вставьте строку темы (codex-theme-v1:...)');
  if (!input || !input.trim().startsWith('codex-theme-v1:')) {
    if (input !== null) toast('Неверный формат. Строка должна начинаться с codex-theme-v1:');
    return;
  }
  try {
    const json = JSON.parse(input.trim().slice('codex-theme-v1:'.length));
    if (!json.theme || !json.theme.accent || !json.theme.surface || !json.theme.ink) {
      toast('Неверная структура темы'); return;
    }
    const nameBase = json.codeThemeId ? json.codeThemeId.charAt(0).toUpperCase() + json.codeThemeId.slice(1).replace(/-/g, ' ') : 'Imported';
    const preset = {
      id: (json.codeThemeId || 'custom') + '-' + Date.now(),
      name: nameBase + ' (импорт)',
      variant: json.variant || 'dark',
      codeThemeId: json.codeThemeId || 'custom',
      theme: {
        accent: json.theme.accent, surface: json.theme.surface, ink: json.theme.ink,
        contrast: json.theme.contrast ?? 59, opaqueWindows: json.theme.opaqueWindows ?? false,
        fonts: { ui: json.theme.fonts?.ui || null, code: json.theme.fonts?.code || null },
        semanticColors: { diffAdded: json.theme.semanticColors?.diffAdded || '#3fb950', diffRemoved: json.theme.semanticColors?.diffRemoved || '#d9534f', skill: json.theme.semanticColors?.skill || '#b8c8ff' },
      },
      builtin: false,
    };
    if (!state.settings.customThemes) state.settings.customThemes = [];
    state.settings.customThemes.push(preset);
    state.settings.activeThemeId = preset.id;
    state.settings.themeVariant = preset.variant;
    applyTheme(preset);
    fillAppearanceSettings();
    void api.saveSettings(state.settings);
    toast('Тема импортирована: ' + preset.name);
  } catch (e) {
    toast('Ошибка разбора темы: ' + e.message);
  }
}

// ─── End Theme System ────────────────────────────────────────────────────────

function renderUpdateState(update = state.updateState) {
  if (!update) return;
  state.updateState = { ...state.updateState, ...update };
  const currentVersion = state.updateState.currentVersion || '1.11.4';
  const availableVersion = state.updateState.availableVersion;
  const percent = Math.max(0, Math.min(100, Number(state.updateState.percent || 0)));
  const statusText = $('#updateStatusText');
  const button = $('#updateButton');
  const progress = $('#updateProgress');
  if ($('#appVersionText')) $('#appVersionText').textContent = currentVersion;
  if ($('#aboutModalVersionText')) $('#aboutModalVersionText').textContent = 'Версия ' + currentVersion;
  if (!statusText || !button || !progress) return;

  const view = {
    idle: ['Нажмите, чтобы проверить наличие новой версии.', 'Проверить', 'ph-magnifying-glass', false],
    checking: ['Проверяем GitHub Releases...', 'Проверка...', 'ph-circle-notch', true],
    available: [`Доступна версия ${availableVersion || ''}.`, 'Загрузить', 'ph-download-simple', false],
    downloading: [`Загрузка обновления: ${percent}%`, `${percent}%`, 'ph-download-simple', true],
    downloaded: [`Версия ${availableVersion || ''} готова к установке.`, 'Перезапустить и установить', 'ph-arrow-clockwise', false],
    latest: ['У вас установлена последняя версия.', 'Проверить снова', 'ph-check-circle', false],
    development: [state.updateState.message || 'Проверка доступна в установленной версии.', 'Недоступно в dev', 'ph-code', true],
    error: [state.updateState.message || 'Не удалось проверить обновления.', 'Повторить', 'ph-warning-circle', false],
  }[state.updateState.status] || ['Статус обновления неизвестен.', 'Проверить', 'ph-magnifying-glass', false];

  statusText.textContent = view[0];
  button.querySelector('span').textContent = view[1];
  button.querySelector('i').className = `ph-bold ${view[2]}`;
  button.disabled = view[3];
  button.classList.toggle('update-ready', state.updateState.status === 'downloaded');
  $('#updateInfoRow').dataset.status = state.updateState.status;
  progress.classList.toggle('hidden', state.updateState.status !== 'downloading');
  $('#updateProgressBar').style.width = `${percent}%`;
}

const slashCommands = [
  { id: 'permissions', icon: 'ph-shield-check', description: 'Открыть настройки разрешений' },
  { id: 'fullaccess', icon: 'ph-shield-warning', description: 'Включить или выключить полный доступ' },
  { id: 'btw', icon: 'ph-chat-teardrop-dots', description: 'Быстрый вопрос без изменения основной задачи' },
  { id: 'goal', icon: 'ph-target', description: 'Работать, пока указанная цель не будет завершена' },
  { id: 'plan', icon: 'ph-lightbulb', description: 'Сначала составить план, затем перейти к выполнению' },
  { id: 'browser', icon: 'ph-globe', description: 'Поручить агенту задачу для браузера' },
  { id: 'chrome', icon: 'ph-globe-hemisphere-west', description: 'Управление вашим Google Chrome браузером через расширение' },
  { id: 'terminal', icon: 'ph-terminal-window', description: 'Выполнить команды и работать с терминалом' },
  { id: 'image', icon: 'ph-image-square', description: 'Создать или отредактировать изображение' },
  { id: 'documents', icon: 'ph-file-doc', description: 'Создать или изменить документ' },
  { id: 'pdf', icon: 'ph-file-pdf', description: 'Прочитать, создать или проверить PDF' },
  { id: 'spreadsheets', icon: 'ph-table', description: 'Работать с таблицами и данными' },
  { id: 'presentations', icon: 'ph-presentation-chart', description: 'Создать или изменить презентацию' },
  { id: 'review', icon: 'ph-magnifying-glass', description: 'Проверить код и найти проблемы' },
  { id: 'fix', icon: 'ph-wrench', description: 'Найти причину ошибки и исправить её' },
  { id: 'test', icon: 'ph-check-circle', description: 'Запустить проверки и исправить сбои' },
  { id: 'explain', icon: 'ph-chalkboard-teacher', description: 'Понятно объяснить выбранный код или тему' },
  { id: 'grill-me', icon: 'ph-chats-circle', description: 'Провести подробное интервью по плану или идее' },
  { id: 'team', icon: 'ph-users-three', description: 'Запустить настроенную команду из 2–4 моделей' },
  { id: 'teamwork-preview', icon: 'ph-tree-structure', description: 'Разбить большую задачу между несколькими ролями' },
  { id: 'learn', icon: 'ph-lightbulb', description: 'Извлечь полезное правило из результата или исправления' },
];

const LOCAL_PROJECT_PERMISSIONS = { sandboxMode: 'workspace', terminal: 'ask', fileRead: 'allow', fileWrite: 'ask', network: 'ask', allowedCommands: [], deniedCommands: [], fileRules: [], commandRules: [], disabledTools: [] };
const TOOL_CATEGORY_META = {
  database: { label: 'Базы данных', icon: 'ph-database' },
  files: { label: 'Файлы и код', icon: 'ph-files' },
  terminal: { label: 'Терминал и процессы', icon: 'ph-terminal-window' },
  network: { label: 'Интернет и сеть', icon: 'ph-globe' },
  devops: { label: 'Git, Docker и DevOps', icon: 'ph-git-branch' },
  agent: { label: 'Управление агентом', icon: 'ph-brain' },
  other: { label: 'Другие инструменты', icon: 'ph-wrench' },
};
const MODEL_PROVIDERS = {
  deepseek: { label: 'DeepSeek', icon: 'ri:deepseek-fill', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
  openai: { label: 'OpenAI', icon: 'arcticons:openai-chatgpt', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1', models: ['gpt-4.1', 'gpt-4.1-mini', 'o3'] },
  anthropic: { label: 'Anthropic', icon: 'ri:claude-line', baseUrl: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-5', models: ['claude-sonnet-4-5', 'claude-opus-4-1'] },
  google: { label: 'Google Gemini', icon: 'ri:google-fill', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-2.5-pro', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
  openrouter: { label: 'OpenRouter', icon: 'ph-git-branch', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1', models: ['openai/gpt-4.1', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-pro'] },
  agentrouter: { label: 'AgentRouter', icon: 'ph-share-network', baseUrl: 'https://agentrouter.org/v1', model: 'claude-3-5-sonnet-20241022', models: ['claude-3-5-sonnet-20241022', 'gpt-4o', 'deepseek-v3.2'] },
  ollama: { label: 'Ollama', icon: 'simple-icons:ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3-coder', models: ['qwen3-coder', 'llama3.3', 'gemma3'] },
  custom: { label: 'Свой API', icon: 'ph-plugs-connected', baseUrl: '', model: '', models: [] },
};
function providerMeta(provider) { return MODEL_PROVIDERS[provider] || MODEL_PROVIDERS.custom; }

const MODEL_ICONS = [
  ['ri:grok-ai-fill', 'Grok'], ['hugeicons:kimi-ai', 'Kimi'], ['simple-icons:minimax', 'MiniMax'],
  ['ri:deepseek-fill', 'DeepSeek'], ['arcticons:openai-chatgpt', 'ChatGPT'], ['ri:claude-line', 'Claude'],
  ['ri:google-fill', 'Google'], ['simple-icons:ollama', 'Ollama'], ['simple-icons:openai', 'OpenAI'],
  ['simple-icons:anthropic', 'Anthropic'], ['simple-icons:googlegemini', 'Gemini'], ['simple-icons:googlebard', 'Google Bard'],
  ['simple-icons:mistralai', 'Mistral AI'], ['simple-icons:huggingface', 'Hugging Face'], ['simple-icons:perplexity', 'Perplexity'],
  ['simple-icons:qwen', 'Qwen'], ['simple-icons:openrouter', 'OpenRouter'], ['simple-icons:replicate', 'Replicate'],
  ['simple-icons:lmstudio', 'LM Studio'], ['simple-icons:meta', 'Meta AI'], ['simple-icons:nvidia', 'NVIDIA'],
  ['simple-icons:amd', 'AMD'], ['simple-icons:intel', 'Intel'], ['simple-icons:githubcopilot', 'GitHub Copilot'],
  ['simple-icons:cursor', 'Cursor'], ['simple-icons:codeium', 'Codeium'], ['simple-icons:cloudflare', 'Cloudflare'],
  ['simple-icons:amazonwebservices', 'AWS'], ['simple-icons:googlecloud', 'Google Cloud'], ['simple-icons:microsoftazure', 'Microsoft Azure'],
  ['simple-icons:ibm', 'IBM'], ['simple-icons:oracle', 'Oracle'], ['simple-icons:databricks', 'Databricks'],
  ['simple-icons:snowflake', 'Snowflake'], ['simple-icons:langchain', 'LangChain'], ['simple-icons:tensorflow', 'TensorFlow'],
  ['simple-icons:pytorch', 'PyTorch'], ['simple-icons:keras', 'Keras'], ['simple-icons:scikitlearn', 'Scikit-learn'],
  ['simple-icons:anaconda', 'Anaconda'], ['simple-icons:jupyter', 'Jupyter'], ['simple-icons:ray', 'Ray'],
  ['simple-icons:modal', 'Modal'], ['simple-icons:vercel', 'Vercel'], ['simple-icons:neon', 'Neon'],
  ['simple-icons:supabase', 'Supabase'], ['simple-icons:airbyte', 'Airbyte'], ['simple-icons:weightsandbiases', 'Weights & Biases'],
  ['simple-icons:milvus', 'Milvus'], ['simple-icons:deepseek', 'DeepSeek Brand'], ['simple-icons:claude', 'Claude Brand'],
  ['ri:ai-generate-2', 'AI Generate'], ['ri:robot-2-line', 'AI Robot'], ['ri:brain-2-line', 'AI Brain'],
  ['hugeicons:ai-brain-01', 'AI Brain Chip'], ['hugeicons:ai-cloud-01', 'AI Cloud'], ['hugeicons:ai-chat-02', 'AI Chat'],
  ['hugeicons:ai-innovation-01', 'AI Innovation'], ['hugeicons:ai-book', 'AI Knowledge'], ['hugeicons:ai-network', 'AI Network'],
  ['hugeicons:ai-search', 'AI Search'], ['hugeicons:ai-security-01', 'AI Security'], ['hugeicons:ai-video', 'AI Video'],
  ['hugeicons:ai-voice', 'AI Voice'], ['ri:openai-fill', 'OpenAI Remix'], ['ri:gemini-fill', 'Gemini Remix'],
  ['hugeicons:ai-audio', 'AI Audio'], ['hugeicons:ai-chip', 'AI Chip'], ['hugeicons:ai-dna', 'AI DNA'],
  ['hugeicons:ai-file', 'AI File'], ['hugeicons:ai-game', 'AI Game'], ['hugeicons:ai-idea', 'AI Idea'],
  ['hugeicons:ai-image', 'AI Image'], ['hugeicons:ai-lock', 'AI Lock'], ['hugeicons:ai-magic', 'AI Magic'],
  ['hugeicons:ai-mail', 'AI Mail'], ['hugeicons:ai-mic', 'AI Microphone'], ['hugeicons:ai-scan', 'AI Scan'],
  ['hugeicons:ai-user', 'AI User'], ['hugeicons:ai-view', 'AI Vision'], ['hugeicons:chat-bot', 'Chat Bot'],
  ['hugeicons:neural-network', 'Neural Network'], ['hugeicons:user-ai', 'User AI'], ['hugeicons:video-ai', 'Video AI'],
  ['hugeicons:artificial-intelligence-01', 'Artificial Intelligence'], ['hugeicons:robot-01', 'Robot'],
  ['mingcute:ai-fill', 'AI Solid'], ['mingcute:ai-line', 'AI Outline'], ['mingcute:book-2-ai-fill', 'AI Book Solid'],
  ['mingcute:bulb-2-ai-fill', 'AI Bulb Solid'], ['mingcute:bulb-ai-line', 'AI Bulb Outline'], ['mingcute:chat-1-ai-fill', 'AI Chat Solid'],
  ['mingcute:chat-1-ai-line', 'AI Chat Outline'], ['mingcute:chat-2-ai-fill', 'AI Dialog'], ['mingcute:file-ai-fill', 'AI Document Solid'],
  ['mingcute:file-ai-line', 'AI Document Outline'], ['mingcute:head-ai-fill', 'AI Head Solid'], ['mingcute:head-ai-line', 'AI Head Outline'],
  ['mingcute:mail-ai-fill', 'AI Mail Solid'], ['mingcute:mic-ai-fill', 'AI Mic Solid'], ['mingcute:pen-2-ai-fill', 'AI Pen Solid'],
  ['mingcute:pen-ai-line', 'AI Pen Outline'], ['mingcute:pic-ai-fill', 'AI Picture Solid'], ['mingcute:pic-ai-line', 'AI Picture Outline'],
  ['mingcute:video-ai-fill', 'AI Video Solid'], ['mingcute:video-ai-line', 'AI Video Outline'],
  ['ri:ai', 'Remix AI'], ['ri:ai-agent-fill', 'AI Agent Solid'], ['ri:ai-agent-line', 'AI Agent Outline'],
  ['ri:apps-ai-fill', 'AI Apps'], ['ri:book-ai-fill', 'AI Book'], ['ri:brush-ai-fill', 'AI Brush Solid'],
  ['ri:brush-ai-line', 'AI Brush Outline'], ['ri:chat-ai-fill', 'AI Chat Remix'], ['ri:chat-ai-line', 'AI Chat Remix Outline'],
  ['ri:code-ai-fill', 'AI Code Solid'], ['ri:code-ai-line', 'AI Code Outline'], ['ri:dvd-ai-fill', 'AI Media'],
  ['ri:file-ai-fill', 'AI File Remix'], ['ri:film-ai-fill', 'AI Film'], ['ri:image-ai-fill', 'AI Image Solid'],
  ['ri:image-ai-line', 'AI Image Outline'], ['ri:mail-ai-fill', 'AI Mail Remix'], ['ri:mic-2-ai-fill', 'AI Voice Remix'],
  ['ri:pulse-ai-fill', 'AI Pulse'], ['ri:speak-ai-fill', 'AI Speak'],
].map(([id, label]) => ({ id, label }));

function profileIcon(profile) { return profile?.icon || providerMeta(profile?.provider).icon; }
function validIconifyId(value) { return /^[a-z0-9-]+:[a-z0-9-]+$/.test(String(value || '').trim()); }
function iconifyUrl(iconId) {
  if (!validIconifyId(iconId)) return '';
  const [prefix, name] = iconId.split(':');
  return `https://api.iconify.design/${prefix}/${name}.svg`;
}

const PROVIDER_SVGS = {
  'ri:deepseek-fill': '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.75 4.927c-.245-.12-.34.108-.482.224c-.049.038-.09.087-.131.13c-.357.384-.773.634-1.315.604c-.796-.044-1.474.207-2.074.818c-.127-.754-.551-1.203-1.195-1.492c-.338-.15-.68-.3-.915-.626c-.165-.231-.21-.49-.293-.744c-.052-.153-.105-.31-.28-.337c-.192-.03-.266.13-.341.265c-.3.55-.416 1.158-.406 1.772c.027 1.382.608 2.482 1.762 3.266c.132.09.166.18.124.311c-.079.27-.172.531-.255.8c-.052.173-.13.211-.314.135A5.3 5.3 0 0 1 15.97 8.92c-.82-.797-1.563-1.677-2.489-2.366a11 11 0 0 0-.66-.454c-.944-.922.125-1.679.372-1.768c.259-.093.09-.416-.747-.412c-.835.004-1.6.285-2.574.659c-.143.057-.326.153-.446.13a9.2 9.2 0 0 0-2.763-.096c-1.806.203-3.25 1.06-4.31 2.525c-1.275 1.76-1.574 3.759-1.207 5.846c.385 2.197 1.502 4.019 3.22 5.442c1.78 1.474 3.83 2.197 6.169 2.058c1.42-.081 3.003-.273 4.786-1.789c.45.224.922.313 1.707.381c.603.057 1.184-.03 1.634-.123c.704-.15.655-.804.4-.926c-2.065-.966-1.612-.573-2.024-.89c1.05-1.248 2.632-2.544 3.25-6.741c.049-.334.007-.543 0-.814c-.003-.163.034-.228.22-.247a4 4 0 0 0 1.482-.457c1.338-.734 1.867-1.939 1.995-3.385c.019-.22-.004-.45-.236-.565m-11.652 13.01c-2.002-1.58-2.972-2.1-3.373-2.078c-.375.021-.308.452-.225.733c.086.277.198.468.356.711c.109.162.184.402-.108.58c-.645.403-1.766-.134-1.82-.16c-1.303-.77-2.394-1.79-3.163-3.182c-.741-1.342-1.172-2.78-1.243-4.315c-.02-.372.09-.503.456-.57a4.5 4.5 0 0 1 1.466-.037c2.043.3 3.782 1.218 5.24 2.67c.832.829 1.462 1.817 2.11 2.783c.69 1.027 1.432 2.004 2.377 2.804c.333.281.6.495.854.653c-.768.085-2.05.104-2.927-.592m.96-6.199a.294.294 0 1 1 .588 0a.294.294 0 0 1-.296.296a.29.29 0 0 1-.293-.296m2.98 1.537c-.192.078-.383.146-.566.154a1.2 1.2 0 0 1-.765-.245c-.262-.22-.45-.343-.53-.73a1.7 1.7 0 0 1 .016-.566c.068-.315-.008-.516-.228-.7c-.18-.15-.408-.19-.66-.19a.5.5 0 0 1-.244-.076c-.105-.053-.191-.184-.109-.345a1 1 0 0 1 .185-.201c.34-.195.734-.13 1.098.015c.337.139.592.393.959.752c.375.434.442.555.656.88c.168.256.323.518.428.818c.063.186-.02.34-.24.434"/></svg>',
  'arcticons:openai-chatgpt': '<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M18.38 27.94v-14.4l11.19-6.46c6.2-3.58 17.3 5.25 12.64 13.33"/><path d="m18.38 20.94l12.47-7.2l11.19 6.46c6.2 3.58 4.1 17.61-5.23 17.61"/><path d="m24.44 17.44l12.47 7.2v12.93c0 7.16-13.2 12.36-17.86 4.28"/><path d="M30.5 21.2v14.14L19.31 41.8c-6.2 3.58-17.3-5.25-12.64-13.33"/><path d="m30.5 27.94l-12.47 7.2l-11.19-6.46c-6.21-3.59-4.11-17.61 5.22-17.61"/><path d="m24.44 31.44l-12.47-7.2V11.31c0-7.16 13.2-12.36 17.86-4.28"/></g></svg>',
  'ri:claude-line': '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.644 2.553a1 1 0 1 0-1.788.894L9.68 9.1L5.067 5.926a1 1 0 0 0-1.134 1.648l5.472 3.762L3.053 11a1 1 0 1 0-.106 2l5.795.305l-4.297 2.864a1 1 0 1 0 1.11 1.664l3.642-2.428l-2.51 3.515a1 1 0 1 0 1.627 1.162l3.033-4.246l-.833 5a1 1 0 0 0 1.972.33l.802-4.812l2.37 3.688a1 1 0 0 0 1.683-1.082l-1.786-2.778l2.767 2.554a1 1 0 0 0 1.356-1.47l-3.035-2.802l4.233.53a1 1 0 0 0 .248-1.985l-4.19-.524l4.295-1.01a1 1 0 1 0-.458-1.947l-5.59 1.315l4.105-5.224a1 1 0 1 0-1.572-1.236L13.857 9.29l.881-5.636a1 1 0 1 0-1.976-.308l-.886 5.67z"/></svg>',
  'ri:google-fill': '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.064 7.51A10 10 0 0 1 12 2c2.695 0 4.959.991 6.69 2.605l-2.867 2.868C14.786 6.482 13.468 5.977 12 5.977c-2.605 0-4.81 1.76-5.595 4.123c-.2.6-.314 1.24-.314 1.9s.114 1.3.314 1.9c.786 2.364 2.99 4.123 5.595 4.123c1.345 0 2.49-.355 3.386-.955a4.6 4.6 0 0 0 1.996-3.018H12v-3.868h9.418c.118.654.182 1.336.182 2.045c0 3.046-1.09 5.61-2.982 7.35C16.964 21.105 14.7 22 12 22A9.996 9.996 0 0 1 2 12c0-1.614.386-3.14 1.064-4.49"/></svg>',
  'simple-icons:ollama': '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.874.007c-.972.06-1.81 1.17-2.008 4.315c0 .544.064 1.24.155 1.721c.02.107.031.202.023.208l-.187.152C3.54 7.477 2.945 9.12 2.945 10.44c0 1.17.278 2.13.857 2.914c-.5.84-.737 1.91-.737 3.09c0 1.37.283 2.43.845 3.286c-.37.85-.705 1.99-.705 2.926c0 .56.031.832.148 1.279L3.42 24h1.478c-.35-.65-.3-1.92.38-3.984l.148-.29v-.177c0-.32-.09-.43-.25-.543c-.69-.64-.77-1.65-.59-3.994c.12-.49.33-.92.54-1.154c.3-.33.3-.73 0-1.053c-1.61-1.73-.76-4.83 2.09-6.038c.2-.033.57-.028.78.01c.43.08.7-.04.88-.47c.5-1.15 1.86-2.36 3.12-2.36s2.63 1.21 3.12 2.36c.18.43.45.55.88.47c2.85-.5 5.07 3.67 2.89 6.03c-.3.32-.3.72 0 1.05c.5.54.8 1.87.71 3.04c-.06.77-.26 1.46-.53 1.85c-.24.35-.2.64-.06 1.03c.74 1.53.95 2.9.54 3.69l-.04.1h1.46c.3-1.13.15-2.77-.56-4.36c.56-.86.84-1.92.84-3.29c0-1.18-.24-2.25-.74-3.09c.58-.78.86-1.74.86-2.91c0-1.32-.6-2.97-1.91-4.04c.3-1.55.18-3.41-.54-4.38c-1.2-1.62-2.75-.55-3.31 2.66A4.86 4.86 0 0 0 12 3.03c-.83 0-1.69.24-2.46.7C9.05.94 8.02-.06 6.87.01M12 10.07c-2.13 0-3.7 1.31-3.7 3.06c0 1.62 1.44 2.72 3.7 2.72s3.7-1.1 3.7-2.72c0-1.75-1.57-3.06-3.7-3.06m-4.6.16c-.58 0-.95.43-.95 1c0 .56.37.93.95.93s.87-.42.87-1.08c0-.5-.35-.85-.87-.85m9.2 0c-.52 0-.87.35-.87.85c0 .66.29 1.08.87 1.08s.95-.37.95-.93c0-.57-.37-1-.95-1"/></svg>',
};

function renderIcon(iconClass) {
  if (PROVIDER_SVGS[iconClass]) return `<span class="provider-svg">${PROVIDER_SVGS[iconClass]}</span>`;
  const remoteUrl = iconifyUrl(iconClass);
  if (remoteUrl) return `<span class="provider-svg iconify-remote" style="--icon-url:url('${escapeHtml(remoteUrl)}')" aria-hidden="true"></span>`;
  return `<i class="ph-bold ${iconClass}"></i>`;
}
function renderRunningSpinner() {
  return '<svg class="running-spinner" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path fill="currentColor" d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z"><animateTransform attributeName="transform" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></svg>';
}
function renderBarsRotateFade() {
  return '<svg class="execution-bars-spinner" viewBox="0 0 24 24" aria-hidden="true"><g><rect width="2" height="5" x="11" y="1" fill="currentColor" opacity=".14"/><rect width="2" height="5" x="11" y="1" fill="currentColor" opacity=".29" transform="rotate(30 12 12)"/><rect width="2" height="5" x="11" y="1" fill="currentColor" opacity=".43" transform="rotate(60 12 12)"/><rect width="2" height="5" x="11" y="1" fill="currentColor" opacity=".57" transform="rotate(90 12 12)"/><rect width="2" height="5" x="11" y="1" fill="currentColor" opacity=".71" transform="rotate(120 12 12)"/><rect width="2" height="5" x="11" y="1" fill="currentColor" opacity=".86" transform="rotate(150 12 12)"/><rect width="2" height="5" x="11" y="1" fill="currentColor" transform="rotate(180 12 12)"/><animateTransform attributeName="transform" calcMode="discrete" dur="0.75s" repeatCount="indefinite" type="rotate" values="0 12 12;30 12 12;60 12 12;90 12 12;120 12 12;150 12 12;180 12 12;210 12 12;240 12 12;270 12 12;300 12 12;330 12 12;360 12 12"/></g></svg>';
}

const commandDefinitions = [
  { id: 'new-chat', label: 'Новый чат', icon: 'ph-chat-circle-dots', shortcut: 'Ctrl+N' },
  { id: 'choose-folder', label: 'Открыть проект', icon: 'ph-folder-plus' },
  { id: 'history', label: 'История чатов', icon: 'ph-clock-counter-clockwise' },
  { id: 'toggle-sidebar', label: 'Переключить боковую панель', icon: 'ph-sidebar-simple', shortcut: 'Ctrl+B' },
  { id: 'settings', label: 'Открыть настройки', icon: 'ph-gear-six', shortcut: 'Ctrl+,' },
];

function id(prefix = 'id') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function activeConversation() { return state.conversations.find((item) => item.id === state.activeId); }
function conversationModelProfile(conversation = activeConversation()) {
  const profiles = state.settings?.modelProfiles || [];
  return profiles.find((item) => item.id === conversation?.modelProfileId)
    || profiles.find((item) => item.id === state.settings?.activeProfileId)
    || profiles[0];
}
function isConversationRunning(conversationId = state.activeId) { return Boolean(conversationId && state.runningIds.has(conversationId)); }
function rememberUiState() {
  if (state.activeId) localStorage.setItem('xacode.lastConversationId', state.activeId); else localStorage.removeItem('xacode.lastConversationId');
  localStorage.setItem('xacode.lastView', state.view);
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function folderName(value) { return value?.split(/[\\/]/).filter(Boolean).pop() || 'XaCode'; }
function shortPath(value) {
  if (!value) return 'Выбрать папку проекта';
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.length > 4 ? `…\\${parts.slice(-4).join('\\')}` : value;
}
function formatAge(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}м`;
  const days = Math.floor(minutes / 1440);
  return days < 1 ? `${Math.floor(minutes / 60)}ч` : `${days}д`;
}
function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/\*\*/g, '');
}
function renderMath(latex, displayMode = false) {
  const source = String(latex || '').trim();
  if (!source) return '';
  try {
    if (globalThis.katex?.renderToString) return globalThis.katex.renderToString(source, { displayMode, throwOnError: false, strict: 'ignore', trust: false });
  } catch {}
  return `<code class="math-fallback">${escapeHtml(source)}</code>`;
}
function simpleMarkdown(value) {
  const detailsBlocks = [];
  const mathBlocks = [];
  const codeBlocks = [];
  let source = String(value).replace(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi, (_match, summary, content) => {
    const index = detailsBlocks.push(`<details class="markdown-details"><summary><i class="ph-bold ph-caret-right"></i>${inlineMarkdown(summary.trim())}</summary><div>${simpleMarkdown(content.trim())}</div></details>`) - 1;
    return `\n@@XACODE_DETAILS_${index}@@\n`;
  });
  const addMath = (latex, displayMode) => {
    const tag = displayMode ? 'div' : 'span';
    const index = mathBlocks.push(`<${tag} class="markdown-math ${displayMode ? 'display' : 'inline'}" role="math">${renderMath(latex, displayMode)}</${tag}>`) - 1;
    return `@@XACODE_MATH_${index}@@`;
  };
  source = source
    .replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_match, language, code) => {
      const normalizedLanguage = String(language || '').toLowerCase();
      const cleanCode = code.trimEnd();
      let block;
      if (normalizedLanguage === 'mermaid') {
        block = `<div class="mermaid-card"><div class="mermaid-card-header"><i class="ph-bold ph-graph"></i><span>Диаграмма</span></div><div class="mermaid" data-mermaid-source="${escapeHtml(encodeURIComponent(cleanCode))}"></div><pre class="mermaid-fallback"><code>${escapeHtml(cleanCode)}</code></pre></div>`;
      } else {
        const asciiDiagram = normalizedLanguage === 'ascii' || (normalizedLanguage === 'text' && /[┌┐└┘│─→←▼▲]/.test(cleanCode));
        block = `<div class="code-block-wrapper"><div class="code-label"><span>${escapeHtml(asciiDiagram ? 'ASCII диаграмма' : language || 'код')}</span><button type="button" class="code-copy-btn" title="Копировать код"><i class="ph-bold ph-copy"></i><span>Копировать</span></button></div><pre class="${asciiDiagram ? 'ascii-diagram' : ''}"><code>${escapeHtml(cleanCode)}</code></pre></div>`;
      }
      const index = codeBlocks.push(block) - 1;
      return `@@XACODE_BLOCK_${index}@@`;
    })
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, latex) => `\n${addMath(latex, true)}\n`)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, latex) => `\n${addMath(latex, true)}\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, latex) => addMath(latex, false))
    .replace(/(^|[^$])\$([^\n$]+)\$(?!\$)/g, (_match, prefix, latex) => `${prefix}${addMath(latex, false)}`)
    .replace(/\s+—\s+/g, ' - ');
  const lines = source.split(/\r?\n/);
  let html = '';
  let listType = '';
  const closeList = () => { if (listType) { html += `</${listType}>`; listType = ''; } };
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    const nextLine = lines[lineIndex + 1]?.trim() || '';
    if (trimmed.includes('|') && /^\|?\s*:?-{3,}/.test(nextLine)) {
      closeList();
      const splitRow = (row) => row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      const headers = splitRow(trimmed);
      html += `<div class="markdown-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>`;
      lineIndex += 2;
      while (lineIndex < lines.length && lines[lineIndex].includes('|') && lines[lineIndex].trim()) {
        html += `<tr>${splitRow(lines[lineIndex]).map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`;
        lineIndex += 1;
      }
      html += '</tbody></table></div>';
      lineIndex -= 1;
      continue;
    }
    const unordered = trimmed.match(/^[-*•]\s+(.+)/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (unordered || ordered) {
      const nextType = unordered ? 'ul' : 'ol';
      if (listType !== nextType) { closeList(); listType = nextType; html += `<${listType}>`; }
      const item = (unordered || ordered)[1];
      const task = item.match(/^\[([ xX])\]\s+(.+)/);
      html += task ? `<li class="task-list-item"><input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}>${inlineMarkdown(task[2])}</li>` : `<li>${inlineMarkdown(item)}</li>`;
      continue;
    }
    closeList();
    if (!trimmed) continue;
    if (/^@@XACODE_(?:BLOCK|MATH|DETAILS)_\d+@@$/.test(trimmed)) { html += trimmed; continue; }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (heading) { const level = Math.min(3, heading[1].length + 1); html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`; continue; }
    if (/^[-─]{3,}$/.test(trimmed)) { html += '<hr>'; continue; }
    if (trimmed.startsWith('> ')) { html += `<blockquote>${inlineMarkdown(trimmed.slice(2))}</blockquote>`; continue; }
    html += `<p>${inlineMarkdown(trimmed)}</p>`;
  }
  closeList();
  return html
    .replace(/@@XACODE_BLOCK_(\d+)@@/g, (_match, index) => codeBlocks[Number(index)] || '')
    .replace(/@@XACODE_MATH_(\d+)@@/g, (_match, index) => mathBlocks[Number(index)] || '')
    .replace(/@@XACODE_DETAILS_(\d+)@@/g, (_match, index) => detailsBlocks[Number(index)] || '');
}
let mermaidInitialized = false;
async function renderMermaidDiagrams(root = document) {
  const nodes = [...root.querySelectorAll('.mermaid[data-mermaid-source]')];
  if (!nodes.length) return;
  if (!globalThis.mermaid?.run) {
    nodes.forEach((node) => node.closest('.mermaid-card')?.classList.add('failed'));
    return;
  }
  if (!mermaidInitialized) {
    globalThis.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark', suppressErrorRendering: true, fontFamily: 'Segoe UI, sans-serif', themeVariables: { background: '#121316', primaryColor: '#242b3a', primaryTextColor: '#e5e7eb', primaryBorderColor: '#6478aa', lineColor: '#8b9abe', secondaryColor: '#1d2533', tertiaryColor: '#17191d' } });
    mermaidInitialized = true;
  }
  for (const node of nodes) {
    const card = node.closest('.mermaid-card');
    try {
      node.textContent = decodeURIComponent(node.dataset.mermaidSource || '');
      node.removeAttribute('data-mermaid-source');
      await globalThis.mermaid.run({ nodes: [node], suppressErrors: true });
      card?.classList.add('rendered');
    } catch {
      card?.classList.add('failed');
      node.remove();
    }
  }
}
function parseTokenMetric(content) {
  const match = String(content).match(/Tokens Spent \(this run\):\*?\s*`?([\d\s.,]+)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/[^\d]/g, ''));
  return Number.isFinite(value) ? value : null;
}
function normalizeMessage(message) {
  let role = message.role;
  let content = message.content;
  if (content === 'null' || content === null || content === 'undefined' || content === 'null\n') {
    content = '';
  }
  if (typeof content === 'string' && /^null\s*$/i.test(content.trim())) {
    content = '';
  }
  if (/^🤖\s*\*?Agent:\*?/i.test(content)) { role = 'assistant'; content = content.replace(/^🤖\s*\*?Agent:\*?\s*/i, ''); }
  if (/^🧠\s*\*?Agent Reasoning:\*?/i.test(content)) { role = 'reasoning'; content = content.replace(/^🧠\s*\*?Agent Reasoning:\*?\s*/i, '').replace(/^_+|_+$/g, ''); }
  if (/Task Started:/i.test(content)) { role = 'status'; content = '🔍 *Анализирую задачу...*'; }
  return { ...message, role, content };
}
function preparedMessages(messages) {
  const result = [];
  for (const original of messages) {
    const tokens = parseTokenMetric(original.content);
    if (tokens !== null) {
      const target = [...result].reverse().find((message) => message.role === 'assistant');
      if (target && tokens > 0) target.tokensUsed = tokens;
      continue;
    }
    const norm = normalizeMessage({ ...original });
    if (norm.role === 'assistant' && !norm.content.trim() && !(norm.attachments && norm.attachments.length)) {
      continue;
    }
    result.push(norm);
  }
  return result;
}
function statusTitle(content) {
  const clean = String(content).replace(/[*_`]/g, '');
  if (/Executing Tool:/i.test(clean)) {
    const rawTool = clean.match(/Executing Tool:\s*([^\n]+)/i)?.[1]?.trim() || 'инструмент';
    const normalizedKey = rawTool.toLowerCase().replace(/[^a-z0-9]/g, '');
    const labels = {
      readfile: 'Чтение файла',
      replacefilecontent: 'Замена фрагмента файла',
      multireplacefilecontent: 'Множественная замена в файле',
      writetofile: 'Запись файла',
      writefile: 'Запись файла',
      editfile: 'Редактирование файла',
      applypatch: 'Применение изменений',
      runcommand: 'Команда в терминале',
      searchweb: 'Поиск в интернете',
      readurlcontent: 'Загрузка веб-страницы',
      readurl: 'Загрузка веб-страницы',
      generateimage: 'Генерация изображения',
      grepsearch: 'Поиск по коду (Grep)',
      searchcode: 'Поиск по коду',
      listdir: 'Просмотр содержимого папки',
      listdirectory: 'Просмотр папки',
      invokesubagent: 'Запуск субагента',
      definesubagent: 'Создание субагента',
      managesubagents: 'Управление субагентами',
      sendmessage: 'Сообщение агенту',
      managetask: 'Фоновые задачи',
      commandstatus: 'Статус команды',
      askquestion: 'Вопрос пользователю',
      askpermission: 'Запрос разрешения',
      schedule: 'Планировщик таймеров'
    };
    return `Выполняется: ${labels[normalizedKey] || rawTool}`;
  }
  if (/Task Started:/i.test(clean)) return 'Задача запущена';
  if (/Analyzing|Анализирую|Анализ задачи/i.test(clean)) return 'Анализирую задачу…';
  if (/Task completed successfully/i.test(clean)) return 'Задача выполнена';
  if (/JSON syntax error/i.test(clean)) return 'Ошибка формата JSON аргументов';
  if (/disabled for the current project/i.test(clean)) return 'Инструмент отключён в проекте';
  if (/Maximum execution loops|Stuck Loop Warning|Protection System/i.test(clean)) return 'Предупреждение защиты зацикливания';
  if (/Error|crashed|Ошибка/i.test(clean)) return 'Ошибка выполнения';
  if (/Warning|⚠️/i.test(clean)) return 'Предупреждение';
  return clean.split('\n').find(Boolean)?.slice(0, 90) || 'Ход выполнения';
}

function statusIcon(content, role, active) {
  const value = String(content).toLowerCase();

  // Explicit Errors & Warnings
  if (/json syntax error/.test(value)) return 'ph-code-block';
  if (/disabled for the current project|отключен/.test(value)) return 'ph-prohibit';
  if (/maximum execution loops|stuck loop warning|protection system/.test(value)) return 'ph-shield-warning';
  if (/error|ошиб|crashed|failed/.test(value)) return 'ph-warning-circle';

  // Completion / Status
  if (/completed|выполнена|готово|успешно/.test(value)) return 'ph-check-circle';
  if (role === 'reasoning' || /reasoning|размышления|рассуждения/.test(value)) return 'ph-brain';

  // Explicit Tool Matches
  if (/replace_file_content|multi_replace_file_content|write_to_file|edit_file|write_file|apply_patch/.test(value)) return 'ph-pencil-line';
  if (/read_file|read_files/.test(value)) return 'ph-file-text';
  if (/grep_search|search_code|find_files/.test(value)) return 'ph-magnifying-glass-plus';
  if (/list_dir|list_directory/.test(value)) return 'ph-folder-open';
  if (/run_command|terminal|process_list|команда в терминале/.test(value)) return 'ph-terminal-window';
  if (/search_web|web_search/.test(value)) return 'ph-globe-hemisphere-west';
  if (/read_url_content|read_url/.test(value)) return 'ph-link-simple';
  if (/generate_image/.test(value)) return 'ph-image-square';
  if (/invoke_subagent|send_message|define_subagent|manage_subagents/.test(value)) return 'ph-robot';
  if (/manage_task|command_status/.test(value)) return 'ph-cpu';
  if (/ask_question|ask_permission|ask_user/.test(value)) return 'ph-question';
  if (/schedule/.test(value)) return 'ph-clock';

  if (/analy|анализ/.test(value)) return 'ph-magnifying-glass';
  return active ? 'ph-spinner-gap' : 'ph-activity';
}

function renderContextIndicator() {
  const conversation = activeConversation();
  const profileId = conversation?.modelProfileId || state.settings?.activeProfileId;
  const profile = state.settings?.modelProfiles?.find((item) => item.id === profileId);
  const used = Number(conversation?.contextUsage || 0);
  const limit = Number(profile?.maxContextTokens || conversation?.contextLimit || 32000);
  const percent = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
  const indicator = $('#contextIndicator');
  indicator.style.setProperty('--context-percent', `${percent * 3.6}deg`);
  const tooltipText = `Контекст: ${used.toLocaleString('ru-RU')} / ${limit.toLocaleString('ru-RU')} токенов (${percent}%). Сжатий: ${conversation?.compressionCount || 0}. Автосжатие при 85%.`;
  indicator.dataset.tooltip = tooltipText;
  indicator.setAttribute('title', tooltipText);
}

let activePromptTrigger = null;

function promptText(includeTokens = true) {
  const editor = $('#promptInput');
  const read = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (node.classList?.contains('prompt-token')) return includeTokens ? ` ${node.dataset.label || node.textContent.trim()} ` : '';
    if (node.tagName === 'BR') return '\n';
    const content = [...node.childNodes].map(read).join('');
    return ['DIV', 'P'].includes(node.tagName) ? `${content}\n` : content;
  };
  return [...editor.childNodes].map(read).join('').replace(/\u00a0/g, ' ').replace(/\uFEFF/g, '').replace(/[ \t]+\n/g, '\n').trim();
}
function estimateConversationTokens(conversation) {
  if (!conversation) return 0;
  const measuredRuns = (conversation.messages || [])
    .reduce((total, message) => total + Math.max(0, Number(message.tokensUsed) || 0), 0);
  const storedTotal = Math.max(0, Number(conversation.totalTokensUsed) || 0);
  const lastRun = Math.max(0, Number(conversation.lastRunTokens) || 0);
  return Math.max(storedTotal, measuredRuns, lastRun);
}

function restoreConversationTokenTotal(conversation) {
  if (!conversation) return;
  conversation.totalTokensUsed = estimateConversationTokens(conversation);
}

function promptTokens() {
  return [...$('#promptInput').querySelectorAll('.prompt-token')].map((token) => ({ type: token.dataset.tokenType, id: token.dataset.id || '', path: token.dataset.path || '', label: token.dataset.label || token.textContent.trim() }));
}

function promptParts() {
  const parts = [];
  const appendText = (text) => {
    const cleaned = String(text || '').replace(/\uFEFF/g, '').replace(/\u00a0/g, ' ');
    if (!cleaned) return;
    const previous = parts.at(-1);
    if (previous?.type === 'text') previous.text += cleaned;
    else parts.push({ type: 'text', text: cleaned });
  };
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) { appendText(node.textContent); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.classList.contains('prompt-token')) {
      parts.push({ type: 'token', tokenType: node.dataset.tokenType, id: node.dataset.id || '', path: node.dataset.path || '', label: node.dataset.label || node.textContent.trim(), icon: node.dataset.icon || '' });
      return;
    }
    if (node.tagName === 'BR') { appendText('\n'); return; }
    [...node.childNodes].forEach(visit);
    if (['DIV', 'P'].includes(node.tagName)) appendText('\n');
  };
  [...$('#promptInput').childNodes].forEach(visit);
  return parts;
}

function clearPrompt() {
  $('#promptInput').replaceChildren();
  activePromptTrigger = null;
}

function currentPromptTrigger() {
  const editor = $('#promptInput');
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !editor.contains(selection.anchorNode) || selection.anchorNode.nodeType !== Node.TEXT_NODE) return null;
  const text = selection.anchorNode.textContent || '';
  const before = text.slice(0, selection.anchorOffset);
  const match = before.match(/(^|\s)([@\/])([^\s@\/]*)$/);
  if (!match) return null;
  const range = document.createRange();
  range.setStart(selection.anchorNode, selection.anchorOffset - match[1].length - match[2].length - match[3].length);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return { kind: match[2], query: match[3], range };
}

function insertTextAtCaret(text) {
  const editor = $('#promptInput');
  editor.focus();
  const selection = window.getSelection();
  const range = selection?.rangeCount && editor.contains(selection.anchorNode) ? selection.getRangeAt(0) : document.createRange();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) range.selectNodeContents(editor), range.collapse(false);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStart(node, node.textContent.length); range.collapse(true);
  selection.removeAllRanges(); selection.addRange(range);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertPromptToken(token) {
  const editor = $('#promptInput');
  const selection = window.getSelection();
  const range = activePromptTrigger?.range || (selection?.rangeCount ? selection.getRangeAt(0) : document.createRange());
  if (!activePromptTrigger && (!selection?.rangeCount || !editor.contains(selection.anchorNode))) range.selectNodeContents(editor), range.collapse(false);
  range.deleteContents();
  const element = document.createElement('span');
  element.className = `prompt-token ${token.type === 'command' ? 'command' : 'file'}`;
  element.contentEditable = 'false';
  element.dataset.tokenType = token.type;
  element.dataset.label = token.label;
  element.dataset.icon = token.icon || '';
  if (token.id) element.dataset.id = token.id;
  if (token.path) element.dataset.path = token.path;
  element.innerHTML = `<i class="ph-bold ${token.icon}"></i><span>${escapeHtml(token.label)}</span><button type="button" class="prompt-token-remove" tabindex="-1" aria-label="Удалить"><i class="ph-bold ph-x"></i></button>`;
  element.querySelector('button').addEventListener('click', () => { element.remove(); updateSendButton(); editor.focus(); });
  const spacer = document.createTextNode('\uFEFF');
  range.insertNode(spacer); range.insertNode(element);
  range.setStart(spacer, spacer.textContent.length); range.collapse(true);
  selection.removeAllRanges(); selection.addRange(range);
  activePromptTrigger = null;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function removeAdjacentPromptToken(direction) {
  const editor = $('#promptInput');
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !editor.contains(selection.anchorNode)) return false;
  const skipped = [];
  const findToken = (start) => {
    let current = start;
    while (current?.nodeType === Node.TEXT_NODE && !(current.textContent || '').trim()) {
      skipped.push(current);
      current = direction === 'backward' ? current.previousSibling : current.nextSibling;
    }
    return current;
  };
  let candidate = null;
  if (selection.anchorNode === editor) candidate = findToken(editor.childNodes[selection.anchorOffset + (direction === 'backward' ? -1 : 0)]);
  else if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
    const node = selection.anchorNode;
    const whitespaceOnly = !(node.textContent || '').trim();
    if (direction === 'backward' && whitespaceOnly && selection.anchorOffset <= 1) { skipped.push(node); candidate = findToken(node.previousSibling); }
    if (direction === 'forward' && whitespaceOnly && selection.anchorOffset === 0) { skipped.push(node); candidate = findToken(node.nextSibling); }
    if (!candidate && direction === 'backward' && selection.anchorOffset === 0) candidate = findToken(node.previousSibling);
    if (!candidate && direction === 'forward' && selection.anchorOffset === (node.textContent || '').length) candidate = findToken(node.nextSibling);
  }
  if (candidate?.nodeType !== Node.ELEMENT_NODE || !candidate.classList.contains('prompt-token')) return false;
  candidate.remove();
  skipped.forEach((node) => { if (node.isConnected && !(node.textContent || '').trim()) node.remove(); });
  updateSendButton();
  return true;
}

function updateSendButton() {
  const sendButton = $('#sendButton');
  const running = isConversationRunning();
  sendButton.disabled = !running && !promptText(false) && !promptTokens().length && !state.attachments.length;
  sendButton.classList.toggle('stop-mode', running);
  sendButton.setAttribute('aria-label', running ? 'Остановить' : 'Отправить');
  sendButton.innerHTML = running ? '<i class="ph-bold ph-stop"></i>' : '<i class="ph-bold ph-arrow-up"></i>';
}
function toast(message) {
  const element = $('#toast');
  const openDialogs = [...document.querySelectorAll('dialog[open]')];
  (openDialogs.at(-1) || document.body).appendChild(element);
  element.innerHTML = `<i class="ph-bold ph-info"></i><span><small>XaCode</small><strong>${escapeHtml(message)}</strong></span><span class="toast-timer" aria-hidden="true"></span>`;
  element.classList.remove('show');
  void element.offsetWidth;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.classList.remove('show'); setTimeout(() => { if (!element.classList.contains('show')) document.body.appendChild(element); }, 220); }, 3600);
}

let imageViewerZoom = 1;

function updateImageViewerZoom() {
  const image = $('#imageViewerImage');
  image.style.transform = `scale(${imageViewerZoom})`;
  $('#imageZoomValue').textContent = `${Math.round(imageViewerZoom * 100)}%`;
  $('#imageZoomOut').disabled = imageViewerZoom <= 0.25;
  $('#imageZoomIn').disabled = imageViewerZoom >= 4;
}

function setImageViewerZoom(nextZoom) {
  imageViewerZoom = Math.max(0.25, Math.min(4, Math.round(nextZoom * 100) / 100));
  updateImageViewerZoom();
}

async function openImageViewer({ source = '', path = '', title = '' } = {}) {
  const resolvedSource = source || (path && api.getFilePreview ? await api.getFilePreview(path) : '');
  if (!resolvedSource) { toast('Не удалось открыть изображение'); return; }
  const dialog = $('#imageViewerDialog');
  $('#imageViewerTitle').textContent = title || folderName(path) || 'Изображение';
  $('#imageViewerImage').src = resolvedSource;
  $('#imageViewerStage').scrollTo({ left: 0, top: 0 });
  imageViewerZoom = 1;
  updateImageViewerZoom();
  if (!dialog.open) dialog.showModal();
}

function closeImageViewer() {
  const dialog = $('#imageViewerDialog');
  if (dialog.open) dialog.close();
  $('#imageViewerImage').removeAttribute('src');
}

function showConfirm({ title, message, confirmLabel = 'Удалить' }) {
  return new Promise((resolve) => {
    const dialog = $('#confirmDialog');
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    $('#confirmAccept').textContent = confirmLabel;
    state.confirmResolve = resolve;
    dialog.showModal();
  });
}

function resolveConfirm(value) {
  if (!state.confirmResolve) return;
  const resolve = state.confirmResolve;
  state.confirmResolve = null;
  $('#confirmDialog').close();
  resolve(value);
}
function persist() { return api.saveConversations(state.conversations); }
function orderedValues(defaultValues, savedValues = []) {
  const valid = new Set(defaultValues);
  const saved = savedValues.filter((value) => valid.has(value));
  const savedSet = new Set(saved);
  return [...defaultValues.filter((value) => !savedSet.has(value)), ...saved];
}
function moveOrderedValue(values, source, target, after = false) {
  if (source === target || !values.includes(source) || !values.includes(target)) return values;
  const next = values.filter((value) => value !== source);
  const targetIndex = next.indexOf(target);
  next.splice(targetIndex + (after ? 1 : 0), 0, source);
  return next;
}
function projectDragKey(workspace) { return `workspace:${encodeURIComponent(workspace || '')}`; }
function workspaceFromDragKey(value) { return decodeURIComponent(String(value || '').replace(/^workspace:/, '')); }
function clearDropIndicators(root = document) {
  root.querySelectorAll('.dragging, .drop-before, .drop-after').forEach((item) => item.classList.remove('dragging', 'drop-before', 'drop-after'));
}
function bindSortable(container, { itemSelector, handleSelector, idAttribute, ignoreSelector = '', onMove }) {
  if (!container) return;
  let sourceId = '';
  const sources = handleSelector ? container.querySelectorAll(handleSelector) : container.querySelectorAll(itemSelector);
  sources.forEach((source) => {
    source.draggable = true;
    source.addEventListener('dragstart', (event) => {
      if (ignoreSelector && event.target.closest(ignoreSelector)) return;
      const item = handleSelector ? source.closest(itemSelector) : source;
      sourceId = item?.dataset[idAttribute] || '';
      if (!sourceId) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', sourceId);
      if (event.dataTransfer.setDragImage && item) event.dataTransfer.setDragImage(item, 18, 18);
      requestAnimationFrame(() => item?.classList.add('dragging'));
    });
    source.addEventListener('dragend', () => { sourceId = ''; clearDropIndicators(container); });
  });
  container.addEventListener('dragover', (event) => {
    if (!sourceId) return;
    const target = event.target.closest(itemSelector);
    const targetId = target?.dataset[idAttribute] || '';
    if (!target || !targetId || targetId === sourceId || !container.contains(target)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const after = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    clearDropIndicators(container);
    container.querySelector(`${itemSelector}[data-${idAttribute.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}="${CSS.escape(sourceId)}"]`)?.classList.add('dragging');
    target.classList.add(after ? 'drop-after' : 'drop-before');
  });
  container.addEventListener('drop', (event) => {
    if (!sourceId) return;
    const target = event.target.closest(itemSelector);
    const targetId = target?.dataset[idAttribute] || '';
    if (!targetId || targetId === sourceId) return;
    event.preventDefault();
    const after = target.classList.contains('drop-after');
    const moved = sourceId;
    sourceId = '';
    clearDropIndicators(container);
    onMove(moved, targetId, after);
  });
}
function isEmptyConversation(conversation) { return !conversation?.messages?.length; }
function cleanupEmptyConversations(keepId = null) {
  const before = state.conversations.length;
  state.conversations = state.conversations.filter((conversation) => !isEmptyConversation(conversation) || conversation.id === keepId);
  if (!state.conversations.some((conversation) => conversation.id === state.activeId)) state.activeId = state.conversations.find((conversation) => !conversation.archived)?.id || null;
  if (state.conversations.length !== before) persist();
}

function setView(view, push = true) {
  if (view !== 'conversation') cleanupEmptyConversations();
  if (push && state.navigation[state.navigationIndex] !== view) {
    state.navigation = state.navigation.slice(0, state.navigationIndex + 1);
    state.navigation.push(view);
    state.navigationIndex = state.navigation.length - 1;
  }
  state.view = view;
  rememberUiState();
  renderMainView();
}

function navigate(delta) {
  const next = state.navigationIndex + delta;
  if (next < 0 || next >= state.navigation.length) return;
  state.navigationIndex = next;
  setView(state.navigation[next], false);
}

function renderSidebar() {
  const list = $('#conversationList');
  const groups = new Map();
  state.conversations.filter((conversation) => !conversation.archived).forEach((conversation) => {
    const key = conversation.workspace || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(conversation);
  });
  const defaultProjects = [...groups.entries()].map(([workspace, conversations]) => ({ workspace, conversations: conversations.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt)), updatedAt: Math.max(...conversations.map((conversation) => new Date(conversation.updatedAt).getTime())) })).sort((a, b) => {
    const pinnedDifference = Number(state.pinnedProjects.includes(b.workspace)) - Number(state.pinnedProjects.includes(a.workspace));
    return pinnedDifference || b.updatedAt - a.updatedAt;
  });
  const projectOrder = orderedValues(defaultProjects.map((project) => project.workspace), state.projectOrder);
  const projectMap = new Map(defaultProjects.map((project) => [project.workspace, project]));
  const projects = projectOrder.map((workspace) => projectMap.get(workspace)).filter(Boolean).map((project) => {
    const savedChatOrder = state.chatOrder[project.workspace] || [];
    const chatIds = orderedValues(project.conversations.map((conversation) => conversation.id), savedChatOrder);
    const conversationMap = new Map(project.conversations.map((conversation) => [conversation.id, conversation]));
    return { ...project, conversations: chatIds.map((id) => conversationMap.get(id)).filter(Boolean) };
  });
  state.projectOrder = projectOrder;
  const projectsHeader = `<div class="projects-heading"><button type="button" class="projects-heading-title" id="projectsHeadingToggle">Проекты <i class="ph-bold ph-caret-down"></i></button><span class="projects-heading-actions"><button type="button" id="projectsHeadingMore" title="Действия"><i class="ph-bold ph-dots-three"></i></button><button type="button" id="projectsHeadingAdd" title="Добавить проект"><i class="ph-bold ph-plus"></i></button></span></div>`;
  list.innerHTML = projectsHeader + (projects.length ? projects.map(({ workspace, conversations }) => {
    const collapsed = Boolean(state.collapsedProjects[workspace]);
    const active = conversations.some((conversation) => conversation.id === state.activeId) && state.view === 'conversation';
    const name = workspace ? (state.projectAliases[workspace] || folderName(workspace)) : 'Без проекта';
    return `<section class="project-group ${active ? 'active-project' : ''}" data-project="${escapeHtml(workspace)}" data-project-key="${escapeHtml(projectDragKey(workspace))}">
      <div class="project-row" data-project-hover="${escapeHtml(workspace)}">
        <button type="button" class="project-toggle" data-project-toggle="${escapeHtml(workspace)}" title="${collapsed ? 'Развернуть' : 'Свернуть'} проект"><i class="ph-bold ${collapsed ? 'ph-caret-right' : 'ph-caret-down'}"></i><i class="ph-bold ph-folder"></i><strong>${escapeHtml(name)}</strong>${state.pinnedProjects.includes(workspace) ? '<i class="ph-bold ph-push-pin project-pin"></i>' : ''}</button>
        ${workspace ? `<span class="project-row-actions"><button type="button" class="project-new-chat" data-project-new-chat="${escapeHtml(workspace)}" title="Новый чат в этой папке"><i class="ph-bold ph-plus"></i></button><button type="button" class="project-delete" data-project-action-inline="remove" data-workspace="${escapeHtml(workspace)}" title="Убрать проект"><i class="ph-bold ph-trash"></i></button><button type="button" class="project-more" data-project-menu="${escapeHtml(workspace)}" title="Действия проекта"><i class="ph-bold ph-dots-three"></i></button></span>` : ''}
      </div>
      <div class="project-conversations ${collapsed ? 'hidden' : ''}" data-chat-list="${escapeHtml(projectDragKey(workspace))}">${conversations.map((conversation) => { const running = isConversationRunning(conversation.id); return `<div class="project-chat ${conversation.id === state.activeId && state.view === 'conversation' ? 'active' : ''} ${conversation.unread ? 'unread' : ''} ${running ? 'running' : ''}" data-chat-row="${conversation.id}"><button type="button" class="project-chat-main" data-conversation="${conversation.id}"><span class="project-chat-title">${escapeHtml(conversation.title)}</span><time>${formatAge(conversation.updatedAt)}</time></button>${running ? `<button type="button" class="chat-running-control" data-stop-chat="${conversation.id}" title="Остановить задачу" aria-label="Остановить задачу в чате ${escapeHtml(conversation.title)}">${renderRunningSpinner()}<span></span></button>` : ''}<span class="chat-hover-actions"><button type="button" data-quick-chat="pin" data-chat-id="${conversation.id}" title="${conversation.pinned ? 'Открепить' : 'Закрепить'}"><i class="ph-bold ph-push-pin${conversation.pinned ? '-slash' : ''}"></i></button><button type="button" data-quick-chat="delete" data-chat-id="${conversation.id}" title="Удалить"><i class="ph-bold ph-trash"></i></button></span></div>`; }).join('')}</div>
    </section>`;
  }).join('') : '<div class="empty-sidebar">Пока нет чатов</div>');
  list.querySelectorAll('[data-conversation]').forEach((button) => button.addEventListener('click', () => openConversation(button.dataset.conversation)));
  list.querySelectorAll('[data-chat-row]').forEach((row) => {
    row.addEventListener('contextmenu', (event) => { event.preventDefault(); showChatMenu(row.dataset.chatRow, event.clientX, event.clientY); });
    row.addEventListener('mouseenter', () => { clearTimeout(state.hoverTimer); state.hoverTimer = setTimeout(() => showChatHover(row.dataset.chatRow, row), 360); });
    row.addEventListener('mouseleave', () => { clearTimeout(state.hoverTimer); state.hoverTimer = setTimeout(() => $('#projectHoverCard').classList.add('hidden'), 130); });
  });
  list.querySelectorAll('[data-quick-chat]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); runChatAction(button.dataset.quickChat, button.dataset.chatId); }));
  list.querySelectorAll('[data-stop-chat]').forEach((button) => button.addEventListener('click', async (event) => { event.stopPropagation(); const conversationId = button.dataset.stopChat; await api.stopAgent(conversationId); state.runningIds.delete(conversationId); render(); }));
  $('#projectsHeadingToggle').addEventListener('click', () => { const allCollapsed = projects.every((project) => state.collapsedProjects[project.workspace]); projects.forEach((project) => { state.collapsedProjects[project.workspace] = !allCollapsed; }); localStorage.setItem('xacode.collapsedProjects', JSON.stringify(state.collapsedProjects)); renderSidebar(); });
  $('#projectsHeadingAdd').addEventListener('click', (event) => { event.stopPropagation(); showProjectsHeaderMenu(event.currentTarget); });
  $('#projectsHeadingMore').addEventListener('click', (event) => { event.stopPropagation(); showProjectsHeaderMenu(event.currentTarget); });
  list.querySelectorAll('[data-project-toggle]').forEach((button) => button.addEventListener('click', () => { const workspace = button.dataset.projectToggle; state.collapsedProjects[workspace] = !state.collapsedProjects[workspace]; localStorage.setItem('xacode.collapsedProjects', JSON.stringify(state.collapsedProjects)); renderSidebar(); }));
  list.querySelectorAll('[data-project-new-chat]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); clearTimeout(state.hoverTimer); $('#projectHoverCard').classList.add('hidden'); newConversation(button.dataset.projectNewChat); }));
  list.querySelectorAll('[data-project-menu]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); showProjectMenu(button.dataset.projectMenu, button); }));
  list.querySelectorAll('[data-project-hover]').forEach((row) => {
    row.addEventListener('mouseenter', () => { clearTimeout(state.hoverTimer); state.hoverTimer = setTimeout(() => showProjectHover(row.dataset.projectHover, row), 360); });
    row.addEventListener('mouseleave', () => { clearTimeout(state.hoverTimer); state.hoverTimer = setTimeout(() => $('#projectHoverCard').classList.add('hidden'), 130); });
  });
  list.querySelectorAll('[data-project-action-inline]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); runProjectAction(button.dataset.projectActionInline, button.dataset.workspace); }));
  bindSortable(list, {
    itemSelector: '.project-group', handleSelector: null, idAttribute: 'projectKey', ignoreSelector: '.project-chat',
    onMove: (sourceKey, targetKey, after) => {
      const source = workspaceFromDragKey(sourceKey);
      const target = workspaceFromDragKey(targetKey);
      state.projectOrder = moveOrderedValue(projects.map((project) => project.workspace), source, target, after);
      localStorage.setItem('xacode.projectOrder', JSON.stringify(state.projectOrder));
      renderSidebar();
    },
  });
  list.querySelectorAll('[data-chat-list]').forEach((container) => bindSortable(container, {
    itemSelector: '.project-chat', handleSelector: null, idAttribute: 'chatRow',
    onMove: (source, target, after) => {
      const workspace = workspaceFromDragKey(container.dataset.chatList);
      const ids = [...container.querySelectorAll('[data-chat-row]')].map((row) => row.dataset.chatRow);
      state.chatOrder[workspace] = moveOrderedValue(ids, source, target, after);
      localStorage.setItem('xacode.chatOrder', JSON.stringify(state.chatOrder));
      renderSidebar();
    },
  }));
  $('#historyButton').classList.toggle('active', state.view === 'history');
}

function positionProjectFloating(element, anchor) {
  const rect = anchor.getBoundingClientRect();
  element.style.left = `${Math.min(window.innerWidth - element.offsetWidth - 12, rect.right + 8)}px`;
  element.style.top = `${Math.min(window.innerHeight - element.offsetHeight - 12, Math.max(42, rect.top - 4))}px`;
}

function showProjectHover(workspace, anchor) {
  if (!workspace || !$('#projectMenu').classList.contains('hidden')) return;
  const conversations = state.conversations.filter((conversation) => conversation.workspace === workspace && !conversation.archived);
  const name = state.projectAliases[workspace] || folderName(workspace);
  const card = $('#projectHoverCard');
  const projectTokens = conversations.reduce((total, conversation) => total + estimateConversationTokens(conversation), 0);
  card.innerHTML = `<div><i class="ph-bold ph-folder"></i><strong>${escapeHtml(name)}</strong>${state.pinnedProjects.includes(workspace) ? '<i class="ph-bold ph-push-pin"></i>' : ''}</div><p><i class="ph-bold ph-chat-circle"></i>${conversations.length} ${conversations.length === 1 ? 'чат' : conversations.length < 5 ? 'чата' : 'чатов'}</p><p><i class="ph-bold ph-chart-bar"></i>Всего потрачено: ${projectTokens.toLocaleString('ru-RU')} токенов</p><p class="project-card-path"><i class="ph-bold ph-folder-open"></i>${escapeHtml(workspace)}</p>`;
  card.classList.remove('hidden');
  requestAnimationFrame(() => positionProjectFloating(card, anchor));
  card.onmouseenter = () => clearTimeout(state.hoverTimer);
  card.onmouseleave = () => { state.hoverTimer = setTimeout(() => card.classList.add('hidden'), 100); };
}

function showProjectMenu(workspace, anchor) {
  const menu = $('#projectMenu');
  $('#projectHoverCard').classList.add('hidden');
  const opening = menu.classList.contains('hidden') || menu.dataset.workspace !== workspace;
  closeFloating(menu);
  menu.dataset.workspace = workspace;
  menu.querySelector('[data-project-action="pin"] span').textContent = state.pinnedProjects.includes(workspace) ? 'Открепить проект' : 'Закрепить проект';
  menu.classList.toggle('hidden', !opening);
  if (opening) requestAnimationFrame(() => positionProjectFloating(menu, anchor));
}

async function runProjectAction(action, workspaceOverride) {
  const menu = $('#projectMenu');
  const workspace = workspaceOverride || menu.dataset.workspace;
  if (!workspaceOverride) menu.classList.add('hidden');
  if (!workspace) return;
  if (action === 'pin') {
    state.pinnedProjects = state.pinnedProjects.includes(workspace) ? state.pinnedProjects.filter((item) => item !== workspace) : [workspace, ...state.pinnedProjects];
    localStorage.setItem('xacode.pinnedProjects', JSON.stringify(state.pinnedProjects));
  }
  if (action === 'open') { const error = await api.openPath(workspace); if (error) toast(error); }
  if (action === 'rename') { const name = window.prompt('Название проекта', state.projectAliases[workspace] || folderName(workspace)); if (name?.trim()) { state.projectAliases[workspace] = name.trim(); localStorage.setItem('xacode.projectAliases', JSON.stringify(state.projectAliases)); } }
  if (action === 'archive') { state.conversations.forEach((conversation) => { if (conversation.workspace === workspace) conversation.archived = true; }); state.activeId = state.conversations.find((conversation) => !conversation.archived)?.id || null; await persist(); toast('Чаты проекта доступны в истории'); }
  if (action === 'remove') {
    const confirmed = await showConfirm({
      title: 'Убрать проект?',
      message: 'Проект и его чаты будут удалены только из XaCode. Папка и все файлы на диске останутся без изменений.',
      confirmLabel: 'Убрать',
    });
    if (confirmed) {
      const norm = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
      const wsNorm = norm(workspace);
      state.conversations = state.conversations.filter((conversation) => norm(conversation.workspace) !== wsNorm);
      if (norm(state.workspace) === wsNorm) state.workspace = '';
      if (!state.conversations.some((conversation) => conversation.id === state.activeId)) state.activeId = state.conversations.find((conversation) => !conversation.archived)?.id || null;
      await persist();
    }
  }
  render();
}

function showProjectsHeaderMenu(anchor) {
  const menu = $('#projectsHeaderMenu');
  const opening = menu.classList.contains('hidden');
  closeFloating(menu);
  menu.classList.toggle('hidden', !opening);
  if (opening) requestAnimationFrame(() => positionProjectFloating(menu, anchor));
}

function showChatMenu(conversationId, x, y) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  const menu = $('#chatMenu');
  closeFloating(menu);
  menu.dataset.conversationId = conversationId;
  menu.querySelector('[data-chat-action="pin"] span').textContent = conversation.pinned ? 'Открепить чат' : 'Закрепить чат';
  menu.querySelector('[data-chat-action="unread"] span').textContent = conversation.unread ? 'Пометить прочитанным' : 'Пометить непрочитанным';
  menu.classList.remove('hidden');
  requestAnimationFrame(() => {
    menu.style.left = `${Math.min(window.innerWidth - menu.offsetWidth - 10, Math.max(8, x))}px`;
    menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 10, Math.max(38, y))}px`;
  });
}

async function runChatAction(action, conversationId = $('#chatMenu').dataset.conversationId) {
  $('#chatMenu').classList.add('hidden');
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  if (action === 'pin') conversation.pinned = !conversation.pinned;
  if (action === 'rename') { const name = window.prompt('Название чата', conversation.title); if (name?.trim()) conversation.title = name.trim(); }
  if (action === 'archive') conversation.archived = true;
  if (action === 'unread') conversation.unread = !conversation.unread;
  if (action === 'open' && conversation.workspace) { const error = await api.openPath(conversation.workspace); if (error) toast(error); }
  if (action === 'copy-workspace') { await navigator.clipboard.writeText(conversation.workspace || ''); toast('Путь скопирован'); }
  if (action === 'copy-id') { await navigator.clipboard.writeText(conversation.id); toast('ID чата скопирован'); }
  if (action === 'continue') { state.workspace = conversation.workspace; newConversation(); return; }
  if (action === 'delete') {
    const confirmed = await showConfirm({
      title: 'Удалить чат?',
      message: `Чат «${conversation.title}» будет удалён из XaCode. Файлы проекта останутся без изменений.`,
    });
    if (!confirmed) return;
    state.conversations = state.conversations.filter((item) => item.id !== conversation.id);
  }
  if ((action === 'archive' || action === 'delete') && state.activeId === conversation.id) {
    state.activeId = state.conversations.find((item) => !item.archived && item.id !== conversation.id)?.id || null;
    const newActive = activeConversation();
    if (newActive?.modelProfileId) state.settings.activeProfileId = newActive.modelProfileId;
  }
  await persist();
  render();
}

function snapMessagesToBottom() {
  const container = $('#messages');
  const snap = () => { container.scrollTop = container.scrollHeight; };
  snap();
  requestAnimationFrame(snap);
  container.querySelectorAll('img').forEach((image) => { if (!image.complete) image.addEventListener('load', snap, { once: true }); });
}

const TEAM_PHASE_LABELS = {
  discussion: 'Обсуждение',
  decision: 'Решение координатора',
  execution: 'Выполнение',
  complete: 'Завершено',
  stopped: 'Остановлено',
  error: 'Ошибка',
};
const TEAM_MEMBER_STATE_LABELS = {
  waiting: 'Ожидает',
  thinking: 'Думает…',
  done: 'Готов',
  executing: 'Выполняет…',
  stopped: 'Отключён',
  error: 'Ошибка',
};
const TEAM_ROLE_ICONS = {
  coordinator: 'ph-compass',
  architect: 'ph-blueprint',
  developer: 'ph-code',
  reviewer: 'ph-magnifying-glass',
  custom: 'ph-sparkle',
};

function formatTeamDuration(durationMs) {
  const seconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000));
  if (seconds < 60) return `${seconds} сек.`;
  return `${Math.floor(seconds / 60)} мин. ${seconds % 60} сек.`;
}

function updateTeamRoomElapsed() {
  const room = activeConversation()?.teamRoom;
  const target = $('#teamRoomElapsed');
  if (!room || !target || $('#teamRoom').classList.contains('hidden')) return;
  const finished = ['complete', 'stopped', 'error'].includes(room.phase);
  const end = finished ? new Date(room.updatedAt).getTime() : Date.now();
  target.textContent = formatTeamDuration(end - new Date(room.startedAt).getTime());
}

function renderTeamRoom() {
  const room = activeConversation()?.teamRoom;
  const panel = $('#teamRoom');
  panel.classList.toggle('hidden', !room);
  if (!room) return;

  const running = !['complete', 'stopped', 'error'].includes(room.phase);
  panel.classList.toggle('collapsed', state.teamRoomCollapsed);
  $('#teamRoomToggle').setAttribute('aria-expanded', String(!state.teamRoomCollapsed));
  $('#teamRoomPhase').textContent = TEAM_PHASE_LABELS[room.phase] || room.phase;
  $('#teamRoomRound').textContent = `Раунд ${Math.max(1, Number(room.currentRound || 1))} / ${Math.max(1, Number(room.rounds || 1))}`;
  $('#teamRoomTokens').textContent = `${Number(room.totalTokens || 0).toLocaleString('ru-RU')} токенов`;
  $('#teamRoomStop').disabled = !running;

  $('#teamRoomMembers').innerHTML = (room.members || []).map((member) => {
    const canStop = running && !['stopped', 'error'].includes(member.state);
    const metrics = [
      member.tokens ? `${Number(member.tokens).toLocaleString('ru-RU')} ток.` : '',
      member.durationMs ? formatTeamDuration(member.durationMs) : '',
    ].filter(Boolean).join(' · ');
    return `<article class="team-room-member ${escapeHtml(member.state)}" data-room-member="${escapeHtml(member.id)}">
      <span class="team-room-avatar"><i class="ph-bold ${TEAM_ROLE_ICONS[member.role] || TEAM_ROLE_ICONS.custom}"></i></span>
      <span class="team-room-member-copy"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.roleLabel)} · ${escapeHtml(member.model || '')}</small></span>
      <span class="team-room-member-meta"><span class="team-room-member-state">${escapeHtml(TEAM_MEMBER_STATE_LABELS[member.state] || member.state)}</span>${metrics ? `<span>${escapeHtml(metrics)}</span>` : ''}${canStop ? `<button type="button" data-stop-team-member="${escapeHtml(member.id)}" title="Отключить от обсуждения"><i class="ph-bold ph-user-minus"></i></button>` : ''}</span>
    </article>`;
  }).join('');

  const entries = (room.journal || []).map((entry) => `<article class="team-room-entry">
    <header><strong>${escapeHtml(entry.memberName)} · ${escapeHtml(entry.roleLabel)}</strong><span>Раунд ${Number(entry.round || 1)}</span></header>
    <p title="${escapeHtml(entry.content)}">${escapeHtml(entry.content)}</p>
  </article>`);
  if (room.decision) entries.push(`<article class="team-room-entry team-room-decision"><header><strong>Решение координатора</strong><i class="ph-bold ph-compass"></i></header><p title="${escapeHtml(room.decision)}">${escapeHtml(room.decision)}</p></article>`);
  if (room.error && room.phase === 'error') entries.push(`<article class="team-room-entry"><header><strong>Ошибка команды</strong><i class="ph-bold ph-warning-circle"></i></header><p>${escapeHtml(room.error)}</p></article>`);
  $('#teamRoomFeed').innerHTML = entries.join('') || '<div class="team-room-feed-empty">Участники готовятся к обсуждению…</div>';
  updateTeamRoomElapsed();

  document.querySelectorAll('[data-stop-team-member]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    await api.stopTeamMember(activeConversation().id, button.dataset.stopTeamMember);
    toast('Участник отключается от обсуждения');
  }));
}

function showChatHover(conversationId, anchor) {
  if (!$('#chatMenu').classList.contains('hidden')) return;
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  const card = $('#projectHoverCard');
  const totalTokens = estimateConversationTokens(conversation);
  const lastRunTokens = Math.max(0, Number(conversation.lastRunTokens) || 0);
  card.innerHTML = `<div><i class="ph-bold ph-chat-circle"></i><strong>${escapeHtml(conversation.title)}</strong></div><p><i class="ph-bold ph-chart-bar"></i>Всего потрачено: ${totalTokens.toLocaleString('ru-RU')} токенов</p>${lastRunTokens ? `<p><i class="ph-bold ph-clock-counter-clockwise"></i>Последний запуск: ${lastRunTokens.toLocaleString('ru-RU')} токенов</p>` : ''}`;
  card.classList.remove('hidden');
  requestAnimationFrame(() => positionProjectFloating(card, anchor));
  card.onmouseenter = () => clearTimeout(state.hoverTimer);
  card.onmouseleave = () => { state.hoverTimer = setTimeout(() => card.classList.add('hidden'), 100); };
}

function renderMessages() {
  const conversation = activeConversation();
  if (!conversation) return;
  $('#chatTitle').textContent = conversation.title;
  $('#chatProjectName').textContent = conversation.workspace ? (state.projectAliases[conversation.workspace] || folderName(conversation.workspace)) : 'Без проекта';
  const ws = conversation.workspace || state.workspace;
  $('#workspaceLabel').textContent = ws ? (state.projectAliases[ws] || folderName(ws)) : 'Без проекта';
  const messages = preparedMessages(conversation.messages);
  const lastExecutionIndex = messages.reduce((last, message, index) => ['status', 'reasoning'].includes(message.role) ? index : last, -1);
  $('#messages').innerHTML = messages.map((message, index) => {
    if (message.role === 'status' || message.role === 'reasoning') {
      const title = message.role === 'reasoning' ? 'Рассуждения агента' : statusTitle(message.content);
      const active = isConversationRunning(conversation.id) && index === lastExecutionIndex;
      const failed = !active && (/❌|Error:|Agent crashed|Protection System|Fatal|Ошибка формата/i.test(title) || /❌|Agent crashed|Execution halted/i.test(message.content));
      const complete = /выполнена|completed/i.test(title);
      const stopButton = active ? `<button type="button" class="execution-stop-badge" data-stop-command title="Остановить выполнение"><i class="ph-bold ph-square"></i></button>` : '';
      const statusGlyph = active ? renderBarsRotateFade() : `<i class="ph-bold ${statusIcon(message.content, message.role, false)}"></i>`;
      const cleanContent = String(message.content).replace(/^🛠\s*\*?Executing Tool:\*?\s*[^\n]+\n?/i, '').trim();
      const details = (!cleanContent || /Analyzing|Анализирую/i.test(message.content)) ? '' : `<div class="execution-content">${simpleMarkdown(cleanContent)}</div>`;
      return `<article class="message ${message.role}" data-message="${message.id}"><details class="execution-update ${active ? 'active' : ''} ${failed ? 'failed' : ''}" ${(active || failed) && details ? 'open' : ''}>
        <summary>
          <div class="execution-summary-left">${statusGlyph}<span class="execution-title">${escapeHtml(title)}</span></div>
          <div class="execution-summary-right">${stopButton}<i class="ph-bold ph-caret-down execution-caret"></i></div>
        </summary>
        ${details}
      </details></article>`;
    }
    const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tokens = message.tokensUsed ? `<span class="response-tokens"><i class="ph-bold ph-chart-bar"></i>Использовано ${Number(message.tokensUsed).toLocaleString('ru-RU')} токенов</span>` : '';
    const actions = message.role === 'assistant' ? `<div class="message-actions"><button data-message-action="copy" title="Копировать"><i class="ph-bold ph-copy"></i></button><button data-message-action="like" title="Полезно"><i class="ph-bold ph-thumbs-up"></i></button><button data-message-action="dislike" title="Не полезно"><i class="ph-bold ph-thumbs-down"></i></button></div>` : '';
    let attachmentsHtml = '';
    const visibleAttachments = (message.attachments || []).filter((attachment) => !attachment.mention);
    if (visibleAttachments.length) {
      attachmentsHtml = '<div class="message-attachments">' + visibleAttachments.map(a => {
        if (a.image) return `<button type="button" class="message-image-button" data-view-image="${escapeHtml(a.path)}" title="Открыть изображение"><img class="message-image" data-image-path="${escapeHtml(a.path)}" alt="${escapeHtml(folderName(a.path))}" /></button>`;
        return `<span class="message-file"><i class="ph-bold ph-file"></i>${escapeHtml(folderName(a.path))}</span>`;
      }).join('') + '</div>';
    }
    const bubbleContent = message.role === 'user' && message.promptParts?.length ? message.promptParts.map((part) => {
      if (part.type === 'text') return inlineMarkdown(part.text || '').replace(/\n/g, '<br>');
      const icon = part.icon || (part.tokenType === 'file' ? (isImagePath(part.path) ? 'ph-image' : 'ph-file-code') : slashCommands.find((command) => command.id === part.id)?.icon) || 'ph-sparkle';
      return `<span class="message-prompt-token ${part.tokenType === 'command' ? 'command' : 'file'}"><i class="ph-bold ${icon}"></i><span>${escapeHtml(part.label || part.id || folderName(part.path))}</span></span>`;
    }).join('') : simpleMarkdown(message.content);
    return `<article class="message ${message.role}" data-message="${message.id}"><div>
      <div class="meta">${message.role === 'user' ? 'Вы' : 'XaCode'} · ${time}</div>
      ${attachmentsHtml}
      <div class="bubble">${bubbleContent}</div>
      ${message.role === 'assistant' ? `<div class="response-footer">${tokens}${actions}</div>` : ''}
    </div></article>`;
  }).join('');
  renderMermaidDiagrams($('#messages'));
  hydrateMessageImages();
  snapMessagesToBottom();
  renderContextIndicator();
  renderTeamRoom();
  document.querySelectorAll('[data-message-action]').forEach((button) => button.addEventListener('click', async () => {
    const article = button.closest('[data-message]');
    const message = conversation.messages.find((item) => item.id === article.dataset.message);
    document.querySelectorAll('.stop-command-btn').forEach((btn) => btn.onclick = async () => { const cid = btn.dataset.stopChat; if (cid) { await api.stopAgent(cid); toast('Команда и работа агента остановлены'); } });
    if (button.dataset.messageAction === 'copy') { await navigator.clipboard.writeText(normalizeMessage(message).content); toast('Ответ скопирован'); }
    else { article.querySelectorAll('[data-message-action="like"],[data-message-action="dislike"]').forEach((item) => item.classList.remove('active')); button.classList.add('active'); }
  }));
}

function renderHistory() {
  const query = $('#historySearch').value.trim().toLowerCase();
  const items = state.conversations.filter((conversation) => {
    const status = conversation.archived ? 'archived' : isConversationRunning(conversation.id) ? 'running' : 'complete';
    return state.historyStatuses[status] && (!query || `${conversation.title} ${conversation.workspace}`.toLowerCase().includes(query));
  });
  $('#historyList').innerHTML = items.length ? items.map((conversation) => `<div class="history-row ${conversation.unread ? 'unread' : ''}" data-history-row="${conversation.id}"><button type="button" class="history-row-main" data-history-conversation="${conversation.id}"><i class="ph-bold ph-chat-centered-text"></i><div><strong>${escapeHtml(conversation.title)}</strong><small>${escapeHtml(conversation.workspace ? (state.projectAliases[conversation.workspace] || folderName(conversation.workspace)) : 'Без проекта')}</small></div></button><time>${formatAge(conversation.updatedAt)}</time><span class="history-row-actions"><button type="button" data-history-more="${conversation.id}" title="Действия"><i class="ph-bold ph-dots-three-vertical"></i></button><button type="button" data-history-archive="${conversation.id}" title="${conversation.archived ? 'Вернуть из архива' : 'Архивировать'}"><i class="ph-bold ${conversation.archived ? 'ph-arrow-u-up-left' : 'ph-archive'}"></i></button></span></div>`).join('') : '<div class="empty-list">Чаты не найдены</div>';
  document.querySelectorAll('[data-history-conversation]').forEach((button) => button.addEventListener('click', () => openConversation(button.dataset.historyConversation)));
  document.querySelectorAll('[data-history-row]').forEach((row) => row.addEventListener('contextmenu', (event) => { event.preventDefault(); showChatMenu(row.dataset.historyRow, event.clientX, event.clientY); }));
  document.querySelectorAll('[data-history-more]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const rect = button.getBoundingClientRect(); showChatMenu(button.dataset.historyMore, rect.right, rect.bottom); }));
  document.querySelectorAll('[data-history-archive]').forEach((button) => button.addEventListener('click', async (event) => { event.stopPropagation(); const conversation = state.conversations.find((item) => item.id === button.dataset.historyArchive); conversation.archived = !conversation.archived; await persist(); render(); }));
}

function renderMainView() {
  const conversation = activeConversation();
  const onConversation = state.view === 'conversation';
  const hasMessages = Boolean(conversation?.messages.length);
  $('#emptyState').classList.toggle('hidden', !onConversation || hasMessages);
  $('#chatView').classList.toggle('hidden', !onConversation || !hasMessages);
  $('#historyView').classList.toggle('hidden', state.view !== 'history');
  $('.composer-wrap').classList.toggle('hidden', !onConversation);
  $('#backButton').disabled = state.navigationIndex <= 0;
  $('#forwardButton').disabled = state.navigationIndex >= state.navigation.length - 1;
  if (onConversation && conversation) renderMessages();
  if (state.view === 'history') renderHistory();
  renderSidebar();
}

function render() {
  renderMainView();
  renderContextIndicator();
  const activeProfile = conversationModelProfile();
  $('#modelLabel').textContent = activeProfile?.name || state.settings?.model || 'DeepSeek';
  $('#modelIcon').innerHTML = renderIcon(profileIcon(activeProfile));
  
  const conversation = activeConversation();
  const hasMessages = Boolean(conversation?.messages?.length > 0);
  const isModelLocked = isConversationRunning();
  $('#modelButton').disabled = isModelLocked;
  $('#modelButton').title = isModelLocked ? 'Нельзя изменить модель во время генерации' : 'Выбрать модель для чата';
  
  $('#workspaceLabel').textContent = (activeConversation()?.workspace || state.workspace ? (state.projectAliases[activeConversation()?.workspace || state.workspace] || folderName(activeConversation()?.workspace || state.workspace)) : 'Выбрать папку проекта');
  updateSendButton();
  $('#openProjectButton').disabled = !(activeConversation()?.workspace || state.workspace);
  $('#openProjectMenuButton').disabled = !(activeConversation()?.workspace || state.workspace);
  renderAttachments();
  syncInlineChoiceVisibility();
  renderTeamRoom();
}

function openConversation(conversationId) {
  cleanupEmptyConversations(conversationId);
  state.activeId = conversationId;
  const conversation = activeConversation();
  if (conversation?.unread) { conversation.unread = false; persist(); }
  if (conversation?.workspace) state.workspace = conversation.workspace;
  if (conversation?.modelProfileId) state.settings.activeProfileId = conversation.modelProfileId;
  rememberUiState();
  setView('conversation');
  render();
}

function currentWorkspace() {
  const conversation = state.view === 'conversation' ? activeConversation() : null;
  return conversation?.workspace || state.workspace || '';
}

function newConversation(workspace = currentWorkspace()) {
  cleanupEmptyConversations();
  const targetWorkspace = typeof workspace === 'string' ? workspace : currentWorkspace();
  if (targetWorkspace) state.workspace = targetWorkspace;
  const now = new Date().toISOString();
  const conversation = { id: id('chat'), title: 'Новый чат', modelProfileId: state.settings.activeProfileId, workspace: targetWorkspace, createdAt: now, updatedAt: now, pinned: false, messages: [] };
  state.conversations.unshift(conversation);
  state.activeId = conversation.id;
  rememberUiState();
  persist();
  setView('conversation');
  render();
  setTimeout(() => $('#promptInput').focus(), 320);
}

function addMessage(role, content, conversationId = state.activeId, attachments = [], messagePromptParts = []) {
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation) return;
  conversation.messages.push({ id: id('msg'), role, content, attachments, promptParts: messagePromptParts, createdAt: new Date().toISOString() });
  conversation.updatedAt = new Date().toISOString();
  persist();
  if (conversationId === state.activeId) render(); else renderSidebar();
}

function handleAgentUpdate({ conversationId, content, context }) {
  const targetId = conversationId || state.activeId;
  const conversation = state.conversations.find((item) => item.id === targetId);
  if (!conversation) return;
  if (context) { conversation.contextUsage = context.usageTokens; conversation.contextLimit = context.maxTokens; conversation.compressionCount = context.compressionCount || 0; conversation.contextUpdatedAt = new Date().toISOString(); }
  const tokens = parseTokenMetric(content);
  if (tokens !== null) {
    const target = [...conversation.messages].reverse().find((message) => normalizeMessage(message).role === 'assistant');
    if (target && tokens > 0) target.tokensUsed = tokens;
    conversation.lastRunTokens = tokens;
    conversation.totalTokensUsed = estimateConversationTokens(conversation);
    if (/Task stopped by user/i.test(content)) {
      conversation.messages.push({
        id: id('msg'),
        role: 'status',
        content: `⏹ *Остановлено пользователем*\nИспользовано токенов: ${tokens.toLocaleString('ru-RU')}`,
        createdAt: new Date().toISOString(),
        tokensUsed: tokens
      });
    }
    conversation.updatedAt = new Date().toISOString();
    persist();
    if (targetId === state.activeId) render();
    return;
  }
  const normalized = normalizeMessage({ role: 'status', content });
  addMessage(normalized.role, normalized.content, targetId);
  const completed = /Task completed successfully|Задача выполнена|выполнена успешно/i.test(content);
  if ((normalized.role === 'assistant' || completed) && !state.notifiedRuns.has(targetId)) {
    state.notifiedRuns.add(targetId);
    const summary = normalized.role === 'assistant'
      ? normalized.content.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)
      : conversation.title;
    notifyConversation(targetId, completed ? 'XaCode завершил задачу' : 'XaCode ответил', summary);
  }
}

async function chooseWorkspace() {
  const selected = await api.selectWorkspace();
  if (!selected) return null;
  state.workspace = selected;
  const conversation = activeConversation();
  if (conversation) conversation.workspace = selected;
  persist(); render();
  return selected;
}

function renderAttachments() {
  $('#attachmentChips').classList.toggle('hidden', !state.attachments.length);
  $('#attachmentChips').innerHTML = state.attachments.map((file, index) => {
    if (file.image) return `<div class="attachment-image-preview" data-view-attachment="${index}" title="Открыть изображение">${file.previewUrl ? `<img src="${escapeHtml(file.previewUrl)}" alt="${escapeHtml(folderName(file.path))}" />` : '<i class="ph-bold ph-image"></i>'}<span class="attachment-preview-hint"><i class="ph-bold ph-arrows-out"></i></span><button type="button" data-remove-attachment="${index}" aria-label="Удалить изображение"><i class="ph-bold ph-x"></i></button></div>`;
    return `<span class="attachment-chip"><i class="ph-bold ph-file"></i><span title="${escapeHtml(file.path)}">${escapeHtml(folderName(file.path))}</span><button data-remove-attachment="${index}"><i class="ph-bold ph-x"></i></button></span>`;
  }).join('');
  document.querySelectorAll('[data-remove-attachment]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); state.attachments.splice(Number(button.dataset.removeAttachment), 1); renderAttachments(); }));
  document.querySelectorAll('[data-view-attachment]').forEach((preview) => preview.addEventListener('click', () => {
    const file = state.attachments[Number(preview.dataset.viewAttachment)];
    if (file) openImageViewer({ source: file.previewUrl, path: file.path, title: folderName(file.path) });
  }));
}

function isImagePath(filePath) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(filePath || '');
}

async function addAttachment(filePath, forceImage = false) {
  if (!filePath || state.attachments.some((item) => item.path === filePath)) return;
  const image = forceImage || isImagePath(filePath);
  const previewUrl = image && api.getFilePreview ? await api.getFilePreview(filePath) : '';
  state.attachments.push({ path: filePath, image, previewUrl });
  renderAttachments();
}

function addContextToken(commandId) {
  const command = slashCommands.find((item) => item.id === commandId);
  if (!command) return;
  if (promptTokens().some((item) => item.type === 'command' && item.id === commandId)) {
    removePromptTrigger();
    return;
  }
  insertPromptToken({ type: 'command', id: commandId, label: mentionQuickItems.find((item) => item.id === commandId)?.label || command.id, icon: command.icon });
}

async function selectFiles() {
  const files = await api.selectFiles();
  for (const file of files) await addAttachment(file);
}

async function pasteClipboardImage(event) {
  const hasImage = [...(event.clipboardData?.items || [])].some((item) => item.type.startsWith('image/'));
  if (!hasImage) return;
  event.preventDefault();
  const imagePath = await api.pasteClipboardImage();
  if (!imagePath) { toast('Не удалось прочитать изображение из буфера'); return; }
  await addAttachment(imagePath, true);
  toast('Изображение добавлено');
}

function keepMenuSelectionVisible(menu) {
  requestAnimationFrame(() => menu.querySelector('.mention-option.active')?.scrollIntoView({ block: 'nearest' }));
}

function showSlashMenu(query = '') {
  const menu = $('#slashMenu');
  const normalized = query.replace(/^\//, '').toLowerCase();
  const items = slashCommands.filter((command) => command.id.includes(normalized));
  slashItems = items;
  if (!items.length) { menu.innerHTML = '<div class="mention-empty"><i class="ph-bold ph-magnifying-glass"></i><span>Команда не найдена</span></div>'; menu.classList.remove('hidden'); return; }
  slashSelectedIndex = Math.min(slashSelectedIndex, items.length - 1);
  menu.innerHTML = `<div class="mention-section-label">Команды</div>${items.map((command, index) => `<button type="button" class="mention-option ${index === slashSelectedIndex ? 'active' : ''}" data-slash-command="${command.id}"><span class="mention-option-icon"><i class="ph-bold ${command.icon}"></i></span><span class="mention-option-copy"><strong>/${command.id}</strong><small>${escapeHtml(command.description)}</small></span></button>`).join('')}`;
  menu.classList.remove('hidden');
  keepMenuSelectionVisible(menu);
  menu.querySelectorAll('[data-slash-command]').forEach((button) => button.addEventListener('click', () => {
    const command = button.dataset.slashCommand;
    menu.classList.add('hidden');
    addContextToken(command); $('#promptInput').focus(); updateSendButton();
  }));
  document.querySelectorAll('[data-view-image]').forEach((button) => button.addEventListener('click', () => openImageViewer({ source: button.querySelector('img')?.getAttribute('src') || '', path: button.dataset.viewImage, title: folderName(button.dataset.viewImage) })));
}

async function hydrateMessageImages() {
  const images = [...document.querySelectorAll('.message-image[data-image-path]')];
  await Promise.all(images.map(async (image) => {
    const preview = await api.getFilePreview?.(image.dataset.imagePath);
    if (preview && image.isConnected) image.src = preview;
  }));
  snapMessagesToBottom();
}

function expandSlashPrompt(text) {
  const match = text.match(/^\/([\w-]+)\s*([\s\S]*)$/);
  if (!match) return text;
  const body = match[2].trim();
    const prefixes = {
      btw: '[QUICK SIDE QUESTION] Answer briefly without changing or abandoning the main task.',
      goal: '[GOAL MODE] Continue working until this goal is genuinely completed. Do not stop after only describing a plan.',
      plan: '[PLANNING MODE] First inspect the task, identify risks and dependencies, then present or follow a concise implementation plan.',
      browser: '[BROWSER TASK] Use available browser or web tools when needed.',
      terminal: '[TERMINAL TASK] Use the terminal and available command tools to complete and verify this request.',
      image: '[IMAGE TASK] Use the available image creation or editing capability for this request.',
      documents: '[DOCUMENT TASK] Use the available document tools to create, read, or edit the requested document.',
      pdf: '[PDF TASK] Use the available PDF tools to read, create, inspect, or verify the requested PDF.',
      spreadsheets: '[SPREADSHEET TASK] Use the available spreadsheet tools and validate the resulting data or workbook.',
      presentations: '[PRESENTATION TASK] Use the available presentation tools to create or edit the requested deck.',
      review: '[CODE REVIEW] Inspect the relevant code carefully, prioritize concrete defects, and report or fix them as requested.',
      fix: '[FIX MODE] Diagnose the root cause, implement the fix, and verify the result.',
      test: '[TEST MODE] Run the relevant checks, diagnose failures, and verify the final state.',
      explain: '[EXPLAIN MODE] Explain the selected code or topic clearly and at the user\'s level.',
      'grill-me': '[INTERVIEW MODE] Ask focused questions one at a time to thoroughly examine this idea or plan.',
    team: '[MODEL TEAM REQUEST] The configured team must discuss this task and execute one coordinated decision.',
    'teamwork-preview': '[TEAMWORK PREVIEW] Break this large task into independent roles and present the proposed collaboration plan before execution.',
    learn: '[LEARNING MODE] Extract a concise reusable rule from this success, failure, or correction.',
  };
  return prefixes[match[1]] ? `${prefixes[match[1]]}\n\n${body}` : text;
}

async function handleLocalSlashCommand(text, inlineTokens) {
  const tokenCommand = inlineTokens.find((token) => token.type === 'command' && ['permissions', 'fullaccess'].includes(token.id));
  const rawCommand = text.match(/^\/(permissions|fullaccess)(?:\s+([^\s]+))?\s*$/i);
  const command = tokenCommand?.id || rawCommand?.[1]?.toLowerCase();
  if (!command) return false;
  const argument = (tokenCommand ? text : rawCommand?.[2] || '').trim().toLowerCase();
  clearPrompt();
  if (command === 'permissions') {
    openSettings('permissions');
    return true;
  }
  if (!['enable', 'disable'].includes(argument)) {
    toast('Используйте /fullaccess enable или /fullaccess disable');
    return true;
  }
  const workspace = activeConversation()?.workspace || state.workspace;
  if (!workspace) {
    toast('Сначала выберите проект');
    return true;
  }
  state.workspace = workspace;
  const policy = currentProjectPermissions();
  policy.sandboxMode = argument === 'enable' ? 'full' : 'workspace';
  state.settings.projectPermissions ||= {};
  state.settings.projectPermissionOverrides ||= {};
  state.settings.projectPermissions[workspace] = policy;
  state.settings.projectPermissionOverrides[workspace] = true;
  state.settings.fullAccess = policy.sandboxMode === 'full';
  state.settings = await api.saveSettings(state.settings);
  render();
  toast(argument === 'enable' ? 'Полный доступ включён для проекта' : 'Полный доступ выключен');
  return true;
}

async function sendPrompt() {
  const input = $('#promptInput');
  const text = promptText(false);
  const inlineTokens = promptTokens();
  const displayParts = promptParts();
  if ((!text && !inlineTokens.length && !state.attachments.length) || isConversationRunning()) return;
  if (await handleLocalSlashCommand(text, inlineTokens)) return;
  const teamMode = inlineTokens.some((token) => token.type === 'command' && token.id === 'team') || /^\/team(?:\s|$)/i.test(text);
  if (teamMode && !state.settings?.teamEnabled) {
    toast('Сначала включите и настройте команду моделей');
    openSettings('team');
    return;
  }
  if (!state.activeId) newConversation();
  const conversation = activeConversation();
  if (!conversation.workspace && !await chooseWorkspace()) return;
  const promptTitle = text || inlineTokens.map((token) => token.label).join(' ') || 'Вложения';
  if (conversation.title === 'Новый чат') conversation.title = promptTitle.slice(0, 54) + (promptTitle.length > 54 ? '…' : '');
  const inlineFiles = inlineTokens.filter((token) => token.type === 'file' && token.path);
  const attachedPaths = [...new Set([...state.attachments.map((file) => file.path), ...inlineFiles.map((file) => file.path)])];
  const msgAttachments = [...state.attachments.map(({ previewUrl, ...file }) => file), ...inlineFiles.map((file) => ({ path: file.path, mention: true }))];
  const tokenInstructions = inlineTokens.filter((token) => token.type === 'command').map((token) => expandSlashPrompt(`/${token.id} `).trim()).filter(Boolean);
  const expandedText = [...tokenInstructions, expandSlashPrompt(text)].filter(Boolean).join('\n\n');
  const agentText = attachedPaths.length ? `${expandedText}\n\n[ATTACHED FILES]\n${attachedPaths.join('\n')}` : expandedText;
  const displayText = promptText(true) || inlineTokens.map((token) => token.label).join(' · ');
  clearPrompt(); state.attachments = [];
  addMessage('user', displayText, state.activeId, msgAttachments, displayParts);
  const conversationId = conversation.id;
  conversation.currentRunId = id('run');
  if (teamMode) conversation.teamRoom = undefined;
  await persist();
  state.runningIds.add(conversationId); state.notifiedRuns.delete(conversationId); render();
  try { await api.sendMessage({ conversationId, text: agentText, workspace: conversation.workspace, modelProfileId: conversation.modelProfileId || state.settings.activeProfileId, teamMode }); }
  catch (error) { addMessage('assistant', `Ошибка: ${error.message || error}`, conversationId); if (String(error).includes('API-ключ')) openSettings('models'); }
  finally {
    state.runningIds.delete(conversationId);
    const finishedConversation = state.conversations.find((item) => item.id === conversationId);
    if (finishedConversation) finishedConversation.currentRunId = undefined;
    await persist();
    render();
  }
}

function closeFloating(except) {
  document.querySelectorAll('.popover, .app-menu, .project-floating, .slash-menu').forEach((item) => {
    if (item !== except) {
      item.classList.add('hidden');
      item.classList.remove('open');
    }
  });
}

function togglePopover(element) {
  const willOpen = element.classList.contains('hidden');
  closeFloating(element);
  element.classList.toggle('hidden', !willOpen);
}

function showWorkspacePopover() {
  const workspaces = [...new Set(state.conversations.map((c) => c.workspace).filter(Boolean))];
  $('#workspaceOptions').innerHTML = workspaces.slice(0, 12).map((workspace) => `<div class="workspace-option-wrapper"><button data-workspace="${escapeHtml(workspace)}" class="${workspace === state.workspace ? 'active' : ''}"><i class="ph-bold ph-folder"></i><span>${escapeHtml(shortPath(workspace))}</span>${workspace === state.workspace ? '<i class="ph-bold ph-check"></i>' : ''}</button><button class="create-workspace-chat" data-create-workspace="${escapeHtml(workspace)}" title="Новый чат"><i class="ph-bold ph-plus"></i></button></div>`).join('') || '<div class="popover-label">Недавних проектов пока нет</div>';
  document.querySelectorAll('[data-workspace]').forEach((button) => button.addEventListener('click', () => { state.workspace = button.dataset.workspace; if (activeConversation()) activeConversation().workspace = state.workspace; persist(); closeFloating(); render(); }));
  document.querySelectorAll('[data-create-workspace]').forEach((button) => button.addEventListener('click', (e) => { e.stopPropagation(); state.workspace = button.dataset.createWorkspace; newConversation(); closeFloating(); render(); }));
  togglePopover($('#workspacePopover'));
}

function showModelPopover() {
  const profiles = state.settings.modelProfiles || [];
  const selectedId = conversationModelProfile()?.id;
  $('#modelOptions').innerHTML = profiles.map((profile) => { const meta = providerMeta(profile.provider); return `<button data-profile="${escapeHtml(profile.id)}" class="model-option ${profile.id === selectedId ? 'active' : ''}"><span class="model-option-provider-icon">${renderIcon(profileIcon(profile))}</span><span class="model-option-copy"><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(meta.label)} · ${escapeHtml(profile.model)}</small></span>${profile.id === selectedId ? '<i class="ph-bold ph-check model-option-check"></i>' : ''}</button>`; }).join('');
  document.querySelectorAll('[data-profile]').forEach((button) => button.addEventListener('click', async () => {
    const profile = profiles.find((item) => item.id === button.dataset.profile);
    const conversation = activeConversation();
    if (!profile || !conversation) return;
    conversation.modelProfileId = profile.id;
    state.settings.activeProfileId = profile.id;
    api.saveSettings(state.settings);
    await persist();
    closeFloating();
    render();
    toast(`Модель этого чата: ${profile.name}`);
  }));
  togglePopover($('#modelPopover'));
}

function renderModelProfiles() {
  const profiles = state.settings.modelProfiles || [];
  if (!state.editingProfileId) state.editingProfileId = state.settings.activeProfileId || profiles[0]?.id;
  $('#modelProfilesCount').textContent = profiles.length;
  $('#modelProfilesList').innerHTML = profiles.map((profile) => { const meta = providerMeta(profile.provider); const active = profile.id === state.settings.activeProfileId; return `<div class="model-profile-wrap ${profile.id === state.editingProfileId ? 'selected' : ''} ${active ? 'active-profile' : ''}" data-profile-card="${escapeHtml(profile.id)}"><span class="reorder-handle model-drag-handle" title="Перетащить модель" aria-label="Изменить порядок модели"><i class="ph-bold ph-dots-six-vertical"></i></span><button type="button" data-edit-profile="${escapeHtml(profile.id)}" class="model-profile-row"><span class="model-profile-provider-icon">${renderIcon(profileIcon(profile))}</span><span class="model-profile-copy"><strong>${escapeHtml(profile.name || meta.label)}</strong><small><span class="model-profile-provider-name">${escapeHtml(meta.label)}</span><b>·</b><span class="model-profile-model-name">${escapeHtml(profile.model || 'Модель не указана')}</span></small></span>${active ? '<em><i class="ph-bold ph-check"></i>Активна</em>' : ''}</button><button type="button" class="duplicate-model-profile" data-duplicate-profile="${escapeHtml(profile.id)}" title="Дублировать модель" aria-label="Дублировать модель ${escapeHtml(profile.name || meta.label)}"><i class="ph-bold ph-copy"></i></button><button type="button" class="delete-model-profile" data-delete-profile="${escapeHtml(profile.id)}" title="Удалить модель" aria-label="Удалить модель ${escapeHtml(profile.name || meta.label)}"><i class="ph-bold ph-trash"></i></button></div>`; }).join('');
  bindSortable($('#modelProfilesList'), {
    itemSelector: '.model-profile-wrap', handleSelector: '.model-drag-handle', idAttribute: 'profileCard',
    onMove: (source, target, after) => {
      const ids = moveOrderedValue(state.settings.modelProfiles.map((profile) => profile.id), source, target, after);
      const byId = new Map(state.settings.modelProfiles.map((profile) => [profile.id, profile]));
      state.settings.modelProfiles = ids.map((id) => byId.get(id)).filter(Boolean);
      renderModelProfiles(); fillModelProfile();
    },
  });
  document.querySelectorAll('[data-edit-profile]').forEach((button) => button.addEventListener('click', () => { saveModelProfileDraft(); state.editingProfileId = button.dataset.editProfile; renderModelProfiles(); fillModelProfile(); }));
  document.querySelectorAll('[data-duplicate-profile]').forEach((button) => button.addEventListener('click', () => duplicateModelProfile(button.dataset.duplicateProfile)));
  document.querySelectorAll('[data-delete-profile]').forEach((button) => button.addEventListener('click', async () => {
    saveModelProfileDraft();
    if (profiles.length <= 1) { toast('Нельзя удалить единственное подключение'); return; }
    const profile = profiles.find((item) => item.id === button.dataset.deleteProfile);
    if (!await showConfirm({ title: 'Удалить модель?', message: `Подключение «${profile?.name || ''}» будет удалено. Остальные модели не изменятся.`, confirmLabel: 'Удалить' })) return;
    state.settings.modelProfiles = profiles.filter((item) => item.id !== button.dataset.deleteProfile);
    if (state.settings.activeProfileId === button.dataset.deleteProfile) state.settings.activeProfileId = state.settings.modelProfiles[0].id;
    state.editingProfileId = state.settings.modelProfiles[0].id; renderModelProfiles(); fillModelProfile();
  }));
}

function saveModelProfileDraft(persistDraft = true) {
  const profile = state.settings.modelProfiles?.find((item) => item.id === state.editingProfileId);
  if (!profile || !$('#profileNameInput')) return profile;
  Object.assign(profile, {
    name: $('#profileNameInput').value.trim() || $('#modelInput').value.trim() || providerMeta($('#providerInput').value).label,
    provider: $('#providerInput').value,
    model: $('#modelInput').value.trim(),
    apiKey: $('#apiKeyInput').value.trim(),
    baseUrl: $('#baseUrlInput').value.trim(),
    maxContextTokens: Math.max(4096, Number($('#maxContextInput').value) || 32000),
    enableHyperagentHeader: Boolean($('#enableHyperagentHeaderInput')?.checked),
    hyperagentSecret: $('#hyperagentSecretInput')?.value.trim() || '',
    enableDeepseekThinking: Boolean($('#enableDeepseekThinkingInput')?.checked),
    reasoningEffort: $('#reasoningEffortInput')?.value || 'high',
  });
  if (persistDraft) void api.saveSettings(state.settings);
  return profile;
}

function refreshEditingProfilePreview() {
  const profile = saveModelProfileDraft();
  if (!profile) return;
  const meta = providerMeta(profile.provider);
  const card = document.querySelector(`[data-profile-card="${CSS.escape(profile.id)}"]`);
  if (card) {
    card.querySelector('.model-profile-provider-icon').innerHTML = renderIcon(profileIcon(profile));
    card.querySelector('.model-profile-copy strong').textContent = $('#profileNameInput').value.trim() || meta.label;
    card.querySelector('.model-profile-provider-name').textContent = meta.label;
    card.querySelector('.model-profile-model-name').textContent = profile.model || 'Модель не указана';
  }
  $('#editingProfileTitle').textContent = $('#profileNameInput').value.trim() || meta.label;
}

function renderModelIconPicker(query = '') {
  const profile = state.settings.modelProfiles?.find((item) => item.id === state.editingProfileId);
  if (!profile || !$('#modelIconGrid')) return;
  const normalized = query.trim().toLowerCase();
  const custom = validIconifyId(normalized) && !MODEL_ICONS.some((item) => item.id === normalized)
    ? [{ id: normalized, label: 'Своя иконка' }]
    : [];
  const matches = MODEL_ICONS.filter((item) => !normalized || item.label.toLowerCase().includes(normalized) || item.id.includes(normalized));
  const selectedId = profileIcon(profile);
  const icons = [...custom, ...matches].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
  const visibleIcons = icons.slice(0, state.modelIconVisibleCount);
  const grid = $('#modelIconGrid');
  grid.innerHTML = icons.length ? visibleIcons.map((item) => `<button type="button" class="model-icon-option ${selectedId === item.id ? 'selected' : ''}" data-model-icon="${escapeHtml(item.id)}" title="${escapeHtml(item.label)} · ${escapeHtml(item.id)}" role="option" aria-selected="${selectedId === item.id}">${renderIcon(item.id)}<span>${escapeHtml(item.label)}</span></button>`).join('') + (visibleIcons.length < icons.length ? `<div class="model-icon-more">Прокрутите ниже · ещё ${icons.length - visibleIcons.length}</div>` : '') : '<div class="model-icon-empty">Иконки не найдены. Вставьте полный Iconify ID.</div>';
  grid.querySelectorAll('[data-model-icon]').forEach((button) => button.addEventListener('click', () => {
    profile.icon = button.dataset.modelIcon;
    renderModelIconPicker($('#modelIconSearch').value);
    refreshEditingProfilePreview();
    $('#editingProviderIcon').innerHTML = renderIcon(profileIcon(profile));
  }));
  grid.onscroll = () => {
    if (grid.scrollTop + grid.clientHeight < grid.scrollHeight - 18 || state.modelIconVisibleCount >= icons.length) return;
    const previousScrollTop = grid.scrollTop;
    state.modelIconVisibleCount += 48;
    renderModelIconPicker(query);
    requestAnimationFrame(() => { grid.scrollTop = previousScrollTop; });
  };
}

function syncHyperagentSecretVisibility() {
  const secretField = $('#hyperagentSecretField') || $('#hyperagentSecretGroup');
  const enableHeader = $('#enableHyperagentHeaderInput');
  if (secretField && enableHeader) {
    secretField.style.display = enableHeader.checked ? '' : 'none';
  }
}

function syncThinkingVisibility() {
  const isEnabled = Boolean($('#enableDeepseekThinkingInput')?.checked);
  const reasoningField = $('#reasoningEffortField');
  if (reasoningField) {
    reasoningField.style.display = isEnabled ? '' : 'none';
  }
}

function fillModelProfile() {
  const profiles = state.settings?.modelProfiles || [];
  const profile = profiles.find((item) => item.id === state.editingProfileId) || profiles[0];
  if (!profile) return;
  if ($('#profileNameInput')) $('#profileNameInput').value = profile.name || '';
  if ($('#providerInput')) $('#providerInput').value = profile.provider || 'deepseek';
  if ($('#modelInput')) $('#modelInput').value = profile.model || 'deepseek-chat';
  if ($('#apiKeyInput')) $('#apiKeyInput').value = profile.apiKey || '';
  if ($('#baseUrlInput')) $('#baseUrlInput').value = profile.baseUrl || 'https://api.deepseek.com';
  if ($('#maxContextInput')) $('#maxContextInput').value = profile.maxContextTokens || 32000;
  if ($('#enableHyperagentHeaderInput')) $('#enableHyperagentHeaderInput').checked = Boolean(profile.enableHyperagentHeader);
  if ($('#hyperagentSecretInput')) $('#hyperagentSecretInput').value = profile.hyperagentSecret || '';
  const isDeepSeekDefault = profile.provider === 'deepseek' || /deepseek/i.test(profile.model || '');
  if ($('#enableDeepseekThinkingInput')) {
    $('#enableDeepseekThinkingInput').checked = profile.enableDeepseekThinking !== undefined
      ? Boolean(profile.enableDeepseekThinking)
      : isDeepSeekDefault;
  }
  if ($('#reasoningEffortInput')) $('#reasoningEffortInput').value = profile.reasoningEffort || 'high';
  if ($('#modelIconSearch')) $('#modelIconSearch').value = '';
  state.modelIconVisibleCount = 48;
  try { updateProviderConstructor(false); } catch(e){}
  try { renderModelIconPicker(); } catch(e){}
  try { syncHyperagentSecretVisibility(); } catch(e){}
  try { syncThinkingVisibility(); } catch(e){}
  const meta = providerMeta(profile.provider);
  if ($('#editingProviderIcon')) $('#editingProviderIcon').innerHTML = renderIcon(profileIcon(profile));
  if ($('#editingProfileTitle')) $('#editingProfileTitle').textContent = profile.name || meta.label;
  const active = profile.id === state.settings?.activeProfileId;
  if ($('#activateModelProfile')) {
    $('#activateModelProfile').classList.toggle('is-active', active);
    $('#activateModelProfile').disabled = active;
    const btnSpan = $('#activateModelProfile span');
    if (btnSpan) btnSpan.textContent = active ? 'Используется в чате' : 'Использовать в чате';
  }
}

const TEAM_ROLE_META = {
  coordinator: { label: 'Координатор', description: 'Принимает итоговое решение' },
  architect: { label: 'Архитектор', description: 'Продумывает устройство решения' },
  developer: { label: 'Исполнитель', description: 'Единственный изменяет файлы' },
  reviewer: { label: 'Ревьюер', description: 'Ищет риски и ошибки' },
  custom: { label: 'Специалист', description: 'Работает по своей инструкции' },
};

function ensureTeamSettings() {
  state.settings.teamMembers ||= [];
  state.settings.teamDiscussionRounds = Math.max(1, Math.min(3, Number(state.settings.teamDiscussionRounds || 1)));
}

function setTeamMemberRole(memberId, role) {
  ensureTeamSettings();
  if (role === 'coordinator' || role === 'developer') {
    state.settings.teamMembers.forEach((member) => {
      if (member.id !== memberId && member.role === role) member.role = 'custom';
    });
  }
  const member = state.settings.teamMembers.find((item) => item.id === memberId);
  if (member) member.role = TEAM_ROLE_META[role] ? role : 'custom';
}

function validateTeamSettings() {
  ensureTeamSettings();
  if (!state.settings.teamEnabled) return '';
  const members = state.settings.teamMembers;
  if (members.length < 2 || members.length > 4) return 'Для команды выберите от двух до четырёх моделей.';
  if (members.filter((member) => member.role === 'coordinator').length !== 1) return 'Назначьте одного координатора команды.';
  if (members.filter((member) => member.role === 'developer').length !== 1) return 'Назначьте одного исполнителя, который будет изменять файлы.';
  return '';
}

function renderTeamSettings() {
  ensureTeamSettings();
  const profiles = state.settings.modelProfiles || [];
  const members = state.settings.teamMembers;
  if ($('#teamMembersCount')) $('#teamMembersCount').textContent = `${members.length} / 4`;
  if ($('#teamEnabledInput')) $('#teamEnabledInput').checked = Boolean(state.settings.teamEnabled);
  if ($('#teamDiscussionRoundsInput')) $('#teamDiscussionRoundsInput').value = String(state.settings.teamDiscussionRounds);
  $('.team-settings-card')?.classList.toggle('team-disabled', !state.settings.teamEnabled);
  if ($('#addTeamMember')) $('#addTeamMember').disabled = members.length >= 4 || !profiles.length;

  const profileOptions = (selectedId) => profiles.map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === selectedId ? 'selected' : ''}>${escapeHtml(profile.name)} · ${escapeHtml(profile.model || providerMeta(profile.provider).label)}</option>`).join('');
  const roleOptions = (selectedRole) => Object.entries(TEAM_ROLE_META).map(([role, meta]) => `<option value="${role}" ${role === selectedRole ? 'selected' : ''}>${meta.label}</option>`).join('');
  $('#teamMembersList').innerHTML = members.length ? members.map((member, index) => {
    const roleMeta = TEAM_ROLE_META[member.role] || TEAM_ROLE_META.custom;
    return `<article class="team-member-card" data-team-member="${escapeHtml(member.id)}">
      <div class="team-member-index">${index + 1}</div>
      <div class="team-member-fields">
        <label><span>Модель</span><select data-team-profile="${escapeHtml(member.id)}">${profileOptions(member.profileId)}</select></label>
        <label><span>Роль</span><select data-team-role="${escapeHtml(member.id)}">${roleOptions(member.role)}</select><small>${escapeHtml(roleMeta.description)}</small></label>
        <label class="team-member-instructions"><span>Дополнительная инструкция</span><input data-team-instructions="${escapeHtml(member.id)}" maxlength="500" value="${escapeHtml(member.instructions || '')}" placeholder="Например: сосредоточься на безопасности" /></label>
      </div>
      <button type="button" data-remove-team-member="${escapeHtml(member.id)}" title="Удалить участника" aria-label="Удалить участника"><i class="ph-bold ph-trash"></i></button>
    </article>`;
  }).join('') : '<div class="team-members-empty"><i class="ph-bold ph-users-three"></i><strong>Команда пока пустая</strong><p>Добавьте минимум двух участников.</p></div>';

  document.querySelectorAll('[data-team-profile]').forEach((select) => select.addEventListener('change', () => {
    const member = members.find((item) => item.id === select.dataset.teamProfile);
    if (member) member.profileId = select.value;
  }));
  document.querySelectorAll('[data-team-role]').forEach((select) => select.addEventListener('change', () => {
    setTeamMemberRole(select.dataset.teamRole, select.value);
    renderTeamSettings();
  }));
  document.querySelectorAll('[data-team-instructions]').forEach((input) => input.addEventListener('input', () => {
    const member = members.find((item) => item.id === input.dataset.teamInstructions);
    if (member) member.instructions = input.value;
  }));
  document.querySelectorAll('[data-remove-team-member]').forEach((button) => button.addEventListener('click', () => {
    state.settings.teamMembers = members.filter((member) => member.id !== button.dataset.removeTeamMember);
    renderTeamSettings();
  }));
}

function addTeamMember() {
  ensureTeamSettings();
  if (state.settings.teamMembers.length >= 4) {
    toast('В команде может быть не больше четырёх моделей');
    return;
  }
  const profiles = state.settings.modelProfiles || [];
  if (!profiles.length) {
    toast('Сначала добавьте модель в разделе «Модели и API»');
    return;
  }
  const usedProfiles = new Set(state.settings.teamMembers.map((member) => member.profileId));
  const profile = profiles.find((item) => !usedProfiles.has(item.id)) || profiles[0];
  const index = state.settings.teamMembers.length;
  const defaultRoles = ['coordinator', 'developer', 'architect', 'reviewer'];
  state.settings.teamMembers.push({
    id: id('team-member'),
    profileId: profile.id,
    role: defaultRoles[index] || 'custom',
    instructions: '',
  });
  renderTeamSettings();
}

function validateTeamSettings() {
  ensureTeamSettings();
  if (!state.settings.teamEnabled) return '';
  const members = state.settings.teamMembers;
  if (members.length < 2 || members.length > 4) return 'Для команды выберите от двух до четырёх моделей.';
  if (new Set(members.map((member) => member.profileId)).size !== members.length) return 'Каждый участник команды должен использовать отдельное подключение модели.';
  if (members.filter((member) => member.role === 'coordinator').length !== 1) return 'Назначьте одного координатора команды.';
  if (members.filter((member) => member.role === 'developer').length !== 1) return 'Назначьте одного исполнителя, который будет изменять файлы.';
  return '';
}

function fillTeamSettings() {
  ensureTeamSettings();
  renderTeamSettings();
}

function saveInstructionDraft() {
  const profile = state.settings.instructionProfiles?.find((item) => item.id === state.editingInstructionId);
  if (!profile || !$('#instructionNameInput')) return profile;
  profile.name = $('#instructionNameInput').value.trim() || 'Инструкции';
  profile.prompt = $('#instructionPromptInput').value.trim();
  return profile;
}

function renderInstructionProfiles() {
  const profiles = state.settings.instructionProfiles || [];
  if (!state.editingInstructionId || !profiles.some((profile) => profile.id === state.editingInstructionId)) state.editingInstructionId = state.settings.activeInstructionProfileId || profiles[0]?.id;
  $('#instructionProfilesCount').textContent = profiles.length;
  $('#instructionProfilesList').innerHTML = profiles.map((profile) => {
    const active = profile.id === state.settings.activeInstructionProfileId;
    return `<div class="instruction-profile ${profile.id === state.editingInstructionId ? 'selected' : ''}"><button type="button" data-edit-instruction="${escapeHtml(profile.id)}"><i class="ph-bold ph-note-pencil"></i><span><strong>${escapeHtml(profile.name)}</strong><small>${profile.prompt ? escapeHtml(profile.prompt.slice(0, 54)) : 'Без дополнительной инструкции'}</small></span>${active ? '<em>Активен</em>' : ''}</button>${profiles.length > 1 ? `<button type="button" class="delete-instruction-profile" data-delete-instruction="${escapeHtml(profile.id)}" title="Удалить"><i class="ph-bold ph-trash"></i></button>` : ''}</div>`;
  }).join('');
  document.querySelectorAll('[data-edit-instruction]').forEach((button) => button.addEventListener('click', () => { saveInstructionDraft(); state.editingInstructionId = button.dataset.editInstruction; renderInstructionProfiles(); fillInstructionProfile(); }));
  document.querySelectorAll('[data-delete-instruction]').forEach((button) => button.addEventListener('click', () => {
    saveInstructionDraft();
    state.settings.instructionProfiles = profiles.filter((profile) => profile.id !== button.dataset.deleteInstruction);
    if (state.settings.activeInstructionProfileId === button.dataset.deleteInstruction) state.settings.activeInstructionProfileId = state.settings.instructionProfiles[0].id;
    state.editingInstructionId = state.settings.instructionProfiles[0].id;
    renderInstructionProfiles(); fillInstructionProfile();
  }));
}

function fillInstructionProfile() {
  const profile = state.settings.instructionProfiles?.find((item) => item.id === state.editingInstructionId) || state.settings.instructionProfiles?.[0];
  if (!profile) return;
  $('#instructionNameInput').value = profile.name;
  $('#instructionPromptInput').value = profile.prompt;
  $('#editingInstructionTitle').textContent = profile.name;
  const active = profile.id === state.settings.activeInstructionProfileId;
  $('#activateInstructionProfile').disabled = active;
  $('#activateInstructionProfile').classList.toggle('is-active', active);
  $('#activateInstructionProfile').innerHTML = `<i class="ph-bold ph-check-circle"></i>${active ? 'Используется' : 'Использовать'}`;
}

function createInstructionProfile() {
  saveInstructionDraft();
  const profile = { id: id('instructions'), name: 'Новый профиль', prompt: '' };
  state.settings.instructionProfiles.push(profile);
  state.editingInstructionId = profile.id;
  renderInstructionProfiles(); fillInstructionProfile();
  $('#instructionNameInput').focus(); $('#instructionNameInput').select();
}

function fillCustomizationSettings() {
  state.settings.instructionProfiles ||= [{ id: 'instructions-default', name: 'Основной', prompt: '' }];
  state.settings.activeInstructionProfileId ||= state.settings.instructionProfiles[0].id;
  state.editingInstructionId ||= state.settings.activeInstructionProfileId;
  $('#customInstructionsEnabled').checked = Boolean(state.settings.customInstructionsEnabled);
  $('#temperatureEnabled').checked = Boolean(state.settings.temperatureEnabled);
  $('#temperatureInput').value = String(state.settings.temperature ?? 0.7);
  $('#temperatureValue').textContent = Number(state.settings.temperature ?? 0.7).toFixed(1);
  $('#temperatureControls').classList.toggle('disabled', !state.settings.temperatureEnabled);
  renderInstructionProfiles(); fillInstructionProfile();
}

function currentProjectPermissions() {
  const hasOverride = Boolean(state.workspace && state.settings.projectPermissionOverrides?.[state.workspace]);
  return clonePermissions(hasOverride ? state.settings.projectPermissions?.[state.workspace] : state.settings.permissionDefaults);
}

function clonePermissions(policy) {
  const value = { ...LOCAL_PROJECT_PERMISSIONS, ...(policy || {}) };
  return { ...value, allowedCommands: [...(value.allowedCommands || [])], deniedCommands: [...(value.deniedCommands || [])], fileRules: [...(value.fileRules || [])], commandRules: [...(value.commandRules || [])], disabledTools: [...(value.disabledTools || [])] };
}

function currentPermissionPolicy() {
  return state.permissionScope === 'global' ? clonePermissions(state.settings.permissionDefaults) : currentProjectPermissions();
}

function updateProviderConstructor(applyPreset = true) {
  const meta = providerMeta($('#providerInput').value);
  $('#providerDescription').textContent = $('#providerInput').value === 'anthropic' ? 'Anthropic Messages API' : $('#providerInput').value === 'ollama' ? 'Локальный OpenAI-совместимый сервер, API-ключ не нужен' : 'OpenAI-совместимый API';
  $('#editingProviderIcon').innerHTML = renderIcon(meta.icon);
  $('#apiKeyHint').textContent = $('#providerInput').value === 'ollama' ? 'Для локального Ollama ключ обычно не требуется' : 'Ключ будет зашифрован средствами Windows';
  $('#modelSuggestions').innerHTML = meta.models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join('');
  if (applyPreset) { const profile = state.settings.modelProfiles?.find((item) => item.id === state.editingProfileId); if (profile) profile.icon = meta.icon; $('#baseUrlInput').value = meta.baseUrl; $('#modelInput').value = meta.model; if (!$('#profileNameInput').value.trim() || $('#profileNameInput').value === 'Новое подключение') $('#profileNameInput').value = meta.label; $('#editingProfileTitle').textContent = $('#profileNameInput').value.trim() || meta.label; renderModelIconPicker(); }
}

function fillPermissions() {
  const policy = currentPermissionPolicy();
  const global = state.permissionScope === 'global';
  const hasOverride = Boolean(state.workspace && state.settings.projectPermissionOverrides?.[state.workspace]);
  document.querySelectorAll('[data-permission-scope]').forEach((button) => button.classList.toggle('active', button.dataset.permissionScope === state.permissionScope));
  $('#permissionScopeIcon').className = `ph-bold ${global ? 'ph-globe' : 'ph-folder-lock'}`;
  $('#permissionScopeTitle').textContent = global ? 'Глобальные настройки' : (hasOverride ? 'Отдельные настройки проекта' : 'Проект использует глобальные настройки');
  $('#permissionScopeDescription').textContent = global ? 'Применяются ко всем проектам без собственных настроек.' : (hasOverride ? 'Эти разрешения действуют только для выбранной папки.' : 'Измените любой параметр, чтобы создать отдельные настройки проекта.');
  $('#useGlobalPermissions').style.display = !global && hasOverride ? '' : 'none';
  $('#toolScopeTitle').textContent = global ? 'Глобальный набор инструментов' : (hasOverride ? 'Отдельный набор проекта' : 'Проект использует глобальный набор');
  $('#toolScopeDescription').textContent = global ? 'Действует во всех проектах без собственных настроек.' : (hasOverride ? 'Отключения действуют только для выбранной папки.' : 'Измените переключатель, чтобы создать отдельный набор проекта.');
  $('#toolUseGlobalPermissions').style.display = !global && hasOverride ? '' : 'none';
  $('#permissionRulesTitle').textContent = global ? 'Глобальные правила' : 'Правила проекта';
  $('#permissionSandboxMode').value = policy.sandboxMode; $('#permissionFileRead').value = policy.fileRead; $('#permissionFileWrite').value = policy.fileWrite; $('#permissionTerminal').value = policy.terminal; $('#permissionNetwork').value = policy.network;
  const currentPreset = (policy.sandboxMode === 'full' && policy.terminal === 'allow') ? 'full' : (policy.sandboxMode === 'workspace' && policy.terminal === 'allow') ? 'developer' : (policy.sandboxMode === 'workspace' && policy.terminal === 'ask') ? 'balanced' : (policy.sandboxMode === 'strict') ? 'strict' : 'custom';
  document.querySelectorAll('[data-permission-preset]').forEach((card) => card.classList.toggle('active', card.dataset.permissionPreset === currentPreset));
  const count = (policy.allowedCommands?.length || 0) + (policy.deniedCommands?.length || 0) + (policy.fileRules?.length || 0) + (policy.commandRules?.length || 0) + (policy.disabledTools?.length || 0);
  $('#permissionRulesSummary').textContent = count ? `${count} сохранённых правил, отключено инструментов: ${policy.disabledTools?.length || 0}.` : (global ? 'Глобальных дополнительных правил пока нет.' : (hasOverride ? 'Отдельных правил пока нет.' : 'Наследуются глобальные настройки.'));
  
  const cmdCount = (policy.commandRules?.length || 0);
  if ($('#terminalRuleBadge')) {
    $('#terminalRuleBadge').textContent = cmdCount;
    $('#terminalRuleBadge').style.display = cmdCount > 0 ? 'inline-block' : 'none';
  }

  renderPermissionRules(policy);
  renderToolAccess(policy);

  if ($('#mcpEnabledInput')) {
    $('#mcpEnabledInput').checked = state.settings.mcpEnabled !== false;
    $('#mcpServersCard').style.opacity = state.settings.mcpEnabled !== false ? '1' : '0.5';
    $('#mcpServersCard').style.pointerEvents = state.settings.mcpEnabled !== false ? 'auto' : 'none';
  }
  renderMcpServers();
}

function renderMcpServers() {
  const container = $('#mcpServersList');
  if (!container) return;
  const servers = state.settings.mcpServers || {};
  const entries = Object.entries(servers);
  
  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-list" style="margin-top: 10px;">Нет подключенных серверов</div>';
    return;
  }
  
      container.innerHTML = entries.map(([name, config]) => `
      <div class="mcp-server-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid #282a2f; border-radius: var(--radius-md); background: #111214; margin: 8px 0;">
        <div style="display: flex; align-items: center; gap: 14px; overflow: hidden; min-width: 0;">
          <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--radius-sm); background: #23252a; color: #8da5e7;">
            <i class="ph-bold ph-hard-drives" style="font-size: 18px;"></i>
          </div>
          <div style="display: flex; flex-direction: column; overflow: hidden; min-width: 0;">
            <strong style="color: #e1e3e7; font-size: var(--fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(name)}</strong>
            <p style="color: #747a84; font-size: var(--fs-xs); margin: 3px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: ui-monospace, monospace;">${escapeHtml(config.command)} ${escapeHtml((config.args || []).join(' '))}</p>
          </div>
        </div>
        <div style="margin-left: 12px; flex-shrink: 0;">
          <button type="button" class="icon-button delete-mcp-server" data-server-name="${escapeHtml(name)}" title="Удалить" style="background: transparent; color: #777d87; border: none; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); transition: 0.15s ease;"><i class="ph-bold ph-trash" style="font-size: 16px;"></i></button>
        </div>
      </div>
    `).join('');

  document.querySelectorAll('.delete-mcp-server').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.serverName;
      if (name && state.settings.mcpServers[name]) {
        delete state.settings.mcpServers[name];
        void api.saveSettings(state.settings);
        fillPermissions();
      }
    });
  });
}

function renderToolAccess(policy = currentPermissionPolicy()) {
  const disabled = new Set(policy.disabledTools || []);
  const grouped = state.availableTools.reduce((groups, tool) => { const category = tool.category || 'other'; (groups[category] ||= []).push(tool); return groups; }, {});
  $('#toolAccessList').innerHTML = Object.entries(TOOL_CATEGORY_META).filter(([category]) => grouped[category]?.length).map(([category, meta]) => {
    const tools = grouped[category];
    const optional = tools.filter((tool) => !tool.required);
    const enabledCount = optional.filter((tool) => !disabled.has(tool.name)).length;
    const items = tools.map((tool) => `<label class="tool-access-item ${tool.required ? 'required' : ''}"><input type="checkbox" data-tool-toggle="${escapeHtml(tool.name)}" ${disabled.has(tool.name) ? '' : 'checked'} ${tool.required ? 'checked disabled' : ''}><span><strong>${escapeHtml(tool.name)}</strong><small>${escapeHtml(tool.description)}</small></span></label>`).join('');
    return `<section class="tool-access-group"><header><span><i class="ph-bold ${meta.icon}"></i><strong>${meta.label}</strong><small>${enabledCount}/${optional.length || tools.length} включено</small></span>${optional.length ? `<label class="tool-group-toggle" title="Включить или отключить всю категорию"><input type="checkbox" data-tool-category="${category}" ${enabledCount ? 'checked' : ''}><span></span></label>` : ''}</header><div class="tool-access-group-list">${items}</div></section>`;
  }).join('');
  document.querySelectorAll('[data-tool-category]').forEach((input) => {
    const optional = (grouped[input.dataset.toolCategory] || []).filter((tool) => !tool.required);
    const enabledCount = optional.filter((tool) => !disabled.has(tool.name)).length;
    input.indeterminate = enabledCount > 0 && enabledCount < optional.length;
    input.addEventListener('change', () => {
      const names = new Set(policy.disabledTools || []);
      optional.forEach((tool) => input.checked ? names.delete(tool.name) : names.add(tool.name));
      policy.disabledTools = [...names];
      savePermissionDraft(policy, false);
      renderToolAccess(policy);
    });
  });
  document.querySelectorAll('[data-tool-toggle]').forEach((input) => input.addEventListener('change', () => {
    const names = new Set(policy.disabledTools || []);
    if (input.checked) names.delete(input.dataset.toolToggle); else names.add(input.dataset.toolToggle);
    policy.disabledTools = [...names];
    savePermissionDraft(policy, false);
    $('#permissionRulesSummary').textContent = policy.disabledTools.length ? `${policy.disabledTools.length} инструментов отключено и не отправляется модели.` : 'Все инструменты включены.';
    renderToolAccess(policy);
  }));
}

function savePermissionDraft(policy, rerender = true) {
  if (state.permissionScope === 'global') {
    state.settings.permissionDefaults = clonePermissions(policy);
  } else if (state.workspace) {
    state.settings.projectPermissions ||= {};
    state.settings.projectPermissionOverrides ||= {};
    state.settings.projectPermissions[state.workspace] = clonePermissions(policy);
    state.settings.projectPermissionOverrides[state.workspace] = true;
  }
  if (rerender) fillPermissions();
}

function useGlobalPermissionDefaults() {
  if (!state.workspace) return;
  delete state.settings.projectPermissions[state.workspace];
  state.settings.projectPermissionOverrides ||= {};
  state.settings.projectPermissionOverrides[state.workspace] = false;
  fillPermissions();
}

function renderPermissionRules(policy = currentPermissionPolicy()) {
  const effects = '<option value="allow">Разрешать</option><option value="ask">Спрашивать</option><option value="deny">Запрещать</option>';
  
  const readRulesHTML = (policy.fileRules || []).map((rule, index) => rule.access === 'read' ? `<div class="permission-rule-row"><select data-file-rule-effect="${index}">${effects}</select><input data-file-rule-path="${index}" value="${escapeHtml(rule.path)}" placeholder="C:\\путь\\к\\папке" /><button type="button" data-remove-file-rule="${index}"><i class="ph-bold ph-x"></i></button></div>` : '').join('');
  $('#fileReadsList').innerHTML = readRulesHTML || '<p class="empty-rule-list">Точечных правил чтения пока нет.</p>';
  
  const writeRulesHTML = (policy.fileRules || []).map((rule, index) => rule.access === 'write' ? `<div class="permission-rule-row"><select data-file-rule-effect="${index}">${effects}</select><input data-file-rule-path="${index}" value="${escapeHtml(rule.path)}" placeholder="C:\\путь\\к\\папке" /><button type="button" data-remove-file-rule="${index}"><i class="ph-bold ph-x"></i></button></div>` : '').join('');
  $('#fileWritesList').innerHTML = writeRulesHTML || '<p class="empty-rule-list">Точечных правил изменения пока нет.</p>';
  
  $('#commandRulesList').innerHTML = (policy.commandRules || []).map((rule, index) => `<div class="permission-rule-row command"><select data-command-rule-effect="${index}">${effects}</select><input data-command-rule-value="${index}" value="${escapeHtml(rule.command)}" placeholder="например: npm test" /><button type="button" data-remove-command-rule="${index}"><i class="ph-bold ph-x"></i></button></div>`).join('') || '<p class="empty-rule-list">Точечных правил для команд пока нет.</p>';
  
  (policy.fileRules || []).forEach((rule, index) => { const effect = document.querySelector(`[data-file-rule-effect="${index}"]`); if (effect) effect.value = rule.effect; });
  (policy.commandRules || []).forEach((rule, index) => { const effect = document.querySelector(`[data-command-rule-effect="${index}"]`); if (effect) effect.value = rule.effect; });
  
  document.querySelectorAll('[data-file-rule-effect],[data-file-rule-path]').forEach((control) => control.addEventListener('change', () => { const index = Number(control.dataset.fileRuleEffect ?? control.dataset.fileRulePath); const row = policy.fileRules[index]; row.effect = document.querySelector(`[data-file-rule-effect="${index}"]`).value; row.path = document.querySelector(`[data-file-rule-path="${index}"]`).value.trim(); savePermissionDraft(policy, false); }));
  document.querySelectorAll('[data-command-rule-effect],[data-command-rule-value]').forEach((control) => control.addEventListener('change', () => { const index = Number(control.dataset.commandRuleEffect ?? control.dataset.commandRuleValue); policy.commandRules[index].effect = document.querySelector(`[data-command-rule-effect="${index}"]`).value; policy.commandRules[index].command = document.querySelector(`[data-command-rule-value="${index}"]`).value.trim(); savePermissionDraft(policy, false); }));
  
  document.querySelectorAll('[data-remove-file-rule]').forEach((button) => button.addEventListener('click', () => { policy.fileRules.splice(Number(button.dataset.removeFileRule), 1); savePermissionDraft(policy); }));
  document.querySelectorAll('[data-remove-command-rule]').forEach((button) => button.addEventListener('click', () => { policy.commandRules.splice(Number(button.dataset.removeCommandRule), 1); savePermissionDraft(policy); }));
}

const pageDescriptions = {
  general: 'Управление папками проекта, поведением агента и разрешениями.', account: 'Доступ к API и локальные данные подключения.', permissions: 'Правила доступа агента к файлам, терминалу и сети.', 'permissions-mcp': 'Отключайте ненужные возможности модели и экономьте контекст.', appearance: 'Тема и визуальное поведение приложения.', models: 'Провайдер, модель и параметры ИИ.', team: 'Настройка совместной работы двух–четырёх моделей.', customizations: 'Персональные инструкции и стили ответов.', browser: 'Параметры встроенного браузера.', app: 'Версия приложения и системные параметры.', conversations: 'Управление локальной историей разговоров.', shortcuts: 'Горячие клавиши для основных действий.', feedback: 'Локальная диагностика для обратной связи.',
};
function setSettingsPage(page) {
  if (!page) return;
  state.settingsPage = page;
  document.querySelectorAll('[data-settings-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.settingsPage === page);
  });
  document.querySelectorAll('.settings-page').forEach((section) => {
    section.classList.toggle('active', section.dataset.page === page);
  });
  if ($('#settingsPageDescription')) {
    $('#settingsPageDescription').textContent = pageDescriptions[page] || pageDescriptions.general;
  }
  const pagesContainer = $('.settings-pages');
  if (pagesContainer) pagesContainer.scrollTop = 0;
  
  try {
    if (page === 'permissions' || page === 'permissions-mcp') fillPermissions();
    if (page === 'models') { renderModelProfiles(); fillModelProfile(); }
    if (page === 'team') fillTeamSettings();
    if (page === 'customizations') fillCustomizationSettings();
    if (page === 'app') renderUpdateState();
    if (page === 'general') fillGeneralSettings();
    if (page === 'appearance') fillAppearanceSettings();
  } catch(e) {
    console.error('Error switching settings page:', e);
  }
}

function renderSettingsProjects() {
  const unique = [...new Set(state.conversations.map((c) => c.workspace).filter(Boolean))];
  if (state.workspace && !unique.includes(state.workspace)) unique.unshift(state.workspace);
  const visible = state.showAllProjects ? unique : unique.slice(0, 3);
  if ($('#settingsProjectList')) {
    $('#settingsProjectList').innerHTML = visible.map((workspace) => `<button type="button" class="settings-nav-item ${workspace === state.workspace ? 'active-project' : ''}" data-settings-project="${escapeHtml(workspace)}" title="${escapeHtml(workspace)}"><i class="ph-bold ph-folder"></i><span>${escapeHtml(state.projectAliases[workspace] || folderName(workspace))}</span></button>`).join('');
  }
  if ($('#settingsShowAll span')) {
    $('#settingsShowAll span').textContent = state.showAllProjects ? 'Показать меньше' : 'Показать все';
  }
  document.querySelectorAll('[data-settings-project]').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); state.workspace = button.dataset.settingsProject; updateSettingsProjectHeader(); renderSettingsProjects(); fillPermissions(); setSettingsPage('general'); }));
}

function updateSettingsProjectHeader() {
  const workspace = state.workspace || activeConversation()?.workspace;
  if ($('#settingsProjectTitle')) $('#settingsProjectTitle').textContent = state.projectAliases[workspace] || workspace || 'XaCode';
  if ($('#settingsFolderPath')) $('#settingsFolderPath').textContent = workspace || 'Папка проекта не выбрана';
}

function fillGeneralSettings() {
  const s = state.settings || {};
  if ($('#enableProtectionSystemInput')) $('#enableProtectionSystemInput').checked = s.enableProtectionSystem !== false;
  if ($('#maxExecutionLoopsInput')) $('#maxExecutionLoopsInput').value = Math.max(10, Number(s.maxExecutionLoops || 100));
  if ($('#enableChromeIntegrationInput')) $('#enableChromeIntegrationInput').checked = Boolean(s.enableChromeIntegration);
  if ($('#temperatureEnabled')) $('#temperatureEnabled').checked = Boolean(s.temperatureEnabled);
  if ($('#temperatureInput')) $('#temperatureInput').value = s.temperature ?? 0.7;
}

function openSettings(page = 'general') {
  try {
    void loadChromeAuthToken();
    try { cleanupEmptyConversations(state.activeId); } catch(e){}
    try { render(); } catch(e){}
    try { closeFloating(); } catch(e){}
    
    const dialog = $('#settingsDialog');
    if (!dialog) return;

    if (!state.settings) {
      state.settings = { activeProfileId: 'profile-default', modelProfiles: [], showReasoning: false };
    }
    const s = state.settings;
    try { state.settingsSnapshot = JSON.parse(JSON.stringify(state.settings)); } catch(e){}
    state.editingProfileId = s.activeProfileId || s.modelProfiles?.[0]?.id;
    state.editingInstructionId = s.activeInstructionProfileId || s.instructionProfiles?.[0]?.id;

    try { renderModelProfiles(); } catch(e){}
    try { fillModelProfile(); } catch(e){}
    try { fillPermissions(); } catch(e){}
    try { fillCustomizationSettings(); } catch(e){}
    try { fillTeamSettings(); } catch(e){}
    try { fillGeneralSettings(); } catch(e){}

    if ($('#reasoningInput')) $('#reasoningInput').checked = Boolean(s.showReasoning);
    if ($('#contextEnabledInput')) $('#contextEnabledInput').checked = s.contextEnabled !== false;
    if ($('#compressionEnabledInput')) $('#compressionEnabledInput').checked = s.compressionEnabled !== false;
    if ($('#compressionModeSelect')) $('#compressionModeSelect').value = s.compressionMode || 'summary';
    if ($('#securityPreset')) $('#securityPreset').value = currentProjectPermissions().sandboxMode === 'full' ? 'full' : currentProjectPermissions().sandboxMode === 'strict' ? 'restricted' : 'default';
    if ($('#reasoningPreset')) $('#reasoningPreset').value = s.showReasoning ? 'visible' : 'hidden';
    if ($('#settingsStatus')) $('#settingsStatus').textContent = '';

    try { updateSettingsProjectHeader(); } catch(e){}
    try { renderSettingsProjects(); } catch(e){}
    try { setSettingsPage(page); } catch(e){}

    dialog.classList.remove('closing');
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    dialog.classList.add('opening');
    setTimeout(() => dialog.classList.remove('opening'), 220);
  } catch (err) {
    console.error('Error opening settings dialog:', err);
    toast(`Не удалось открыть настройки: ${err.message}`);
  }
}

function closeSettings() {
  const dialog = $('#settingsDialog');
  if (!dialog) return;
  dialog.classList.remove('opening');
  dialog.classList.add('closing');
  setTimeout(() => {
    try {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      }
    } catch(e) {}
    dialog.removeAttribute('open');
    dialog.classList.remove('closing');
  }, 120);
}

function cancelSettings() {
  if (state.settingsSnapshot) {
    state.settings = state.settingsSnapshot;
  }
  state.settingsSnapshot = null;
  closeSettings();
  try { render(); } catch(e) {}
}

let isSavingSettings = false;
async function saveSettings(event) {
  if (event) event.preventDefault();
  if (isSavingSettings) return;
  isSavingSettings = true;
  try {
    const profile = saveModelProfileDraft() || state.settings?.modelProfiles?.[0];
    saveInstructionDraft();
    if ($('#customInstructionsEnabled')) state.settings.customInstructionsEnabled = $('#customInstructionsEnabled').checked;
    if ($('#temperatureEnabled')) state.settings.temperatureEnabled = $('#temperatureEnabled').checked;
    if ($('#contextEnabledInput')) state.settings.contextEnabled = $('#contextEnabledInput').checked;
    if ($('#compressionEnabledInput')) state.settings.compressionEnabled = $('#compressionEnabledInput').checked;
    if ($('#compressionModeSelect')) state.settings.compressionMode = $('#compressionModeSelect').value;
    if ($('#temperatureInput')) state.settings.temperature = Math.max(0, Math.min(2, Number($('#temperatureInput').value) || 0));
    if ($('#enableChromeIntegrationInput')) state.settings.enableChromeIntegration = $('#enableChromeIntegrationInput').checked;
    if ($('#enableProtectionSystemInput')) state.settings.enableProtectionSystem = $('#enableProtectionSystemInput').checked;
    if ($('#fastModeEnabledInput')) state.settings.fastModeEnabled = $('#fastModeEnabledInput').checked;
    if ($('#maxExecutionLoopsInput')) state.settings.maxExecutionLoops = Math.max(10, Number($('#maxExecutionLoopsInput').value) || 100);
    if ($('#teamEnabledInput')) state.settings.teamEnabled = $('#teamEnabledInput').checked;
    if ($('#teamDiscussionRoundsInput')) state.settings.teamDiscussionRounds = Math.max(1, Math.min(3, Number($('#teamDiscussionRoundsInput').value) || 1));
    const teamSettingsError = validateTeamSettings();
    if (teamSettingsError) {
      setSettingsPage('team');
      toast(teamSettingsError);
      return;
    }
    if ($('#reasoningInput') && profile) profile.showReasoning = $('#reasoningInput').checked || $('#reasoningPreset')?.value === 'visible';
    const currentPol = currentPermissionPolicy();
    const policy = {
      ...currentPol,
      sandboxMode: $('#permissionSandboxMode')?.value || currentPol.sandboxMode,
      fileRead: $('#permissionFileRead')?.value || currentPol.fileRead,
      fileWrite: $('#permissionFileWrite')?.value || currentPol.fileWrite,
      terminal: $('#permissionTerminal')?.value || currentPol.terminal,
      network: $('#permissionNetwork')?.value || currentPol.network
    };
    if (state.permissionScope === 'global' || state.settings.projectPermissionOverrides?.[state.workspace]) savePermissionDraft(policy, false);
    const active = state.settings.modelProfiles?.find((item) => item.id === state.settings.activeProfileId) || profile;
    if (active) {
      Object.assign(state.settings, { provider: active.provider, model: active.model, apiKey: active.apiKey, baseUrl: active.baseUrl, fullAccess: currentProjectPermissions().sandboxMode === 'full', showReasoning: active.showReasoning });
    }
    state.settings = await api.saveSettings(state.settings);
    if ($('#settingsStatus')) $('#settingsStatus').textContent = 'Сохранено безопасно';
    setTimeout(closeSettings, 150);
    try { render(); } catch(e){}
    state.settingsSnapshot = null;
  } catch (err) {
    console.error('Error saving settings:', err);
    toast(`Ошибка сохранения настроек: ${err.message}`);
    closeSettings();
  } finally {
    isSavingSettings = false;
  }
}

function createModelProfile() {
  saveModelProfileDraft();
  const profile = { id: id('profile'), name: 'Новое подключение', icon: 'ri:deepseek-fill', provider: 'deepseek', model: 'deepseek-chat', apiKey: '', baseUrl: 'https://api.deepseek.com', maxContextTokens: 32000, showReasoning: false };
  state.settings.modelProfiles.push(profile);
  state.editingProfileId = profile.id;
  renderModelProfiles(); fillModelProfile();
  $('#profileNameInput').focus(); $('#profileNameInput').select();
}

function duplicateModelProfile(profileId = state.editingProfileId) {
  saveModelProfileDraft(false);
  const profiles = state.settings.modelProfiles || [];
  const sourceIndex = profiles.findIndex((profile) => profile.id === profileId);
  if (sourceIndex < 0) return;
  const source = profiles[sourceIndex];
  const baseName = source.name || providerMeta(source.provider).label;
  const copyBaseName = `${baseName} — копия`;
  let copyName = copyBaseName;
  let copyNumber = 2;
  const existingNames = new Set(profiles.map((profile) => profile.name));
  while (existingNames.has(copyName)) copyName = `${copyBaseName} ${copyNumber++}`;
  const duplicate = { ...source, id: id('profile'), name: copyName };
  state.settings.modelProfiles = [
    ...profiles.slice(0, sourceIndex + 1),
    duplicate,
    ...profiles.slice(sourceIndex + 1),
  ];
  state.editingProfileId = duplicate.id;
  void api.saveSettings(state.settings);
  renderModelProfiles();
  fillModelProfile();
  $('#profileNameInput').focus();
  $('#profileNameInput').select();
  toast(`Создана копия модели: ${copyName}`);
}

function setSidebarCollapsed(collapsed) {
  const sidebar = $('#sidebar');
  sidebar.classList.toggle('collapsed', collapsed);
  $('.main-panel').classList.toggle('sidebar-collapsed', collapsed);
  $('#sidebarRestore').classList.toggle('hidden', !collapsed);
  $('#sidebarResizer').classList.toggle('hidden', collapsed);
  $('#toggleSidebar').title = collapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель';
  localStorage.setItem('xacode.sidebarCollapsed', String(collapsed));
}

function toggleSidebar() {
  const collapsed = !$('#sidebar').classList.contains('collapsed');
  if (!collapsed) document.documentElement.style.setProperty('--sidebar-width', `${state.sidebarWidthBeforeCollapse}px`);
  setSidebarCollapsed(collapsed);
}

function initSidebarResize() {
  const resizer = $('#sidebarResizer');
  let frame = 0;
  const applyWidth = (width) => {
    const next = Math.max(112, Math.min(520, width));
    state.sidebarWidth = next;
    document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
    $('#sidebar').classList.toggle('near-collapse', next < 190);
  };
  resizer.addEventListener('pointerdown', (event) => {
    if ($('#sidebar').classList.contains('collapsed')) return;
    state.resizingSidebar = true;
    document.body.classList.add('resizing-sidebar');
    resizer.setPointerCapture(event.pointerId);
  });
  resizer.addEventListener('pointermove', (event) => {
    if (!state.resizingSidebar) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => applyWidth(event.clientX));
  });
  const finish = (event) => {
    if (!state.resizingSidebar) return;
    state.resizingSidebar = false;
    document.body.classList.remove('resizing-sidebar');
    if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
    if (state.sidebarWidth < 185) {
      state.sidebarWidthBeforeCollapse = 314;
      setSidebarCollapsed(true);
    } else {
      $('#sidebar').classList.remove('near-collapse');
      state.sidebarWidthBeforeCollapse = state.sidebarWidth;
      localStorage.setItem('xacode.sidebarWidth', String(Math.round(state.sidebarWidth)));
    }
  };
  resizer.addEventListener('pointerup', finish);
  resizer.addEventListener('pointercancel', finish);
}

function showTooltip(target) {
  const text = target.dataset.tooltip || target.getAttribute('title');
  if (!text) return;
  if (!target.dataset.tooltip) { target.dataset.tooltip = text; target.removeAttribute('title'); }
  clearTimeout(showTooltip.timer);
  showTooltip.timer = setTimeout(() => {
    if (!target.isConnected || !target.matches(':hover')) return;
    const tooltip = $('#uiTooltip');
    tooltip.textContent = text;
    tooltip.classList.remove('hidden');
    const rect = target.getBoundingClientRect();
    const left = Math.min(window.innerWidth - tooltip.offsetWidth - 10, Math.max(10, rect.left + (rect.width - tooltip.offsetWidth) / 2));
    const above = rect.top - tooltip.offsetHeight - 9;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${above > 36 ? above : rect.bottom + 9}px`;
  }, 360);
}

function hideTooltip() {
  clearTimeout(showTooltip.timer);
  $('#uiTooltip').classList.add('hidden');
}

function answerInlineChoice(choice) {
  if (!choice || !state.pendingChoiceId) return;
  api.answerChoice(state.pendingChoiceId, choice);
  state.pendingChoiceId = null;
  state.pendingChoiceConversationId = null;
  state.pendingChoiceQuestion = '';
  state.pendingChoiceOptions = [];
  state.pendingChoiceSelection = '';
  $('#inlineChoice').classList.add('hidden');
  $('.composer-wrap').classList.remove('choice-active');
  $('#inlineChoiceInput').value = '';
}

function syncInlineChoiceVisibility() {
  const visible = Boolean(state.pendingChoiceId && state.pendingChoiceConversationId === state.activeId && state.view === 'conversation');
  $('#inlineChoice').classList.toggle('hidden', !visible);
  $('.composer-wrap').classList.toggle('choice-active', visible);
}

function notifyConversation(conversationId, title, body) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  const needsAttention = conversationId !== state.activeId || state.view !== 'conversation' || document.hidden || !document.hasFocus();
  if (!needsAttention) return;
  conversation.unread = true;
  persist();
  renderSidebar();
  api.showNotification?.({ title: title || 'XaCode', body: body || conversation.title, conversationId });
}

function selectInlineChoice(choice) {
  if (!choice || !state.pendingChoiceId) return;
  state.pendingChoiceSelection = choice;
  $('#inlineChoiceOptions').querySelectorAll('.inline-choice-option').forEach((button) => {
    const selected = button.value === choice;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('#inlineChoiceSubmit').disabled = false;
}

async function openWorkspaceWith(launcher) {
  const workspace = activeConversation()?.workspace || state.workspace;
  if (!workspace) return;
  closeFloating();
  const error = await api.openWorkspaceWith(workspace, launcher);
  if (error) toast(error);
}

async function chooseWorkspaceApplication() {
  const workspace = activeConversation()?.workspace || state.workspace;
  if (!workspace) return;
  closeFloating();
  const error = await api.chooseWorkspaceApp(workspace);
  if (error) toast(error);
}

function showProjectLauncherMenu() {
  const menu = $('#projectLauncherMenu');
  const opening = menu.classList.contains('hidden');
  closeFloating(menu);
  if (!opening) { menu.classList.add('hidden'); return; }
  menu.innerHTML = state.workspaceLaunchers.map((launcher) => `<button type="button" data-workspace-launcher="${launcher.id}">${launcher.icon ? `<img src="${launcher.icon}" alt="" />` : '<i class="ph-bold ph-app-window"></i>'}<span>${escapeHtml(launcher.label)}</span>${launcher.id === 'explorer' ? '<i class="ph-bold ph-check launcher-check"></i>' : ''}</button>`).join('') + '<div class="menu-separator"></div><button type="button" id="chooseWorkspaceApplication"><i class="ph-bold ph-app-window"></i><span>Выбрать приложение…</span></button>';
  menu.classList.remove('hidden');
  const rect = $('#openProjectMenuButton').getBoundingClientRect();
  menu.style.left = `${Math.max(10, rect.right - menu.offsetWidth)}px`;
  menu.style.top = `${rect.bottom + 7}px`;
  menu.querySelectorAll('[data-workspace-launcher]').forEach((button) => button.addEventListener('click', () => openWorkspaceWith(button.dataset.workspaceLauncher)));
  $('#chooseWorkspaceApplication').addEventListener('click', chooseWorkspaceApplication);
}

async function createWorkspaceConversation() {
  const workspace = await api.createWorkspace();
  if (!workspace) return;
  state.workspace = workspace;
  newConversation(workspace);
  toast(`Создан проект ${folderName(workspace)}`);
}

async function selectWorkspaceConversation() {
  const workspace = await api.selectWorkspace();
  if (!workspace) return;
  state.workspace = workspace;
  newConversation(workspace);
  toast(`Добавлен проект ${folderName(workspace)}`);
}

function renderCommandPalette(query = '') {
  const filtered = commandDefinitions.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));
  $('#commandList').innerHTML = filtered.map((command, index) => `<button class="command-item ${index === 0 ? 'selected' : ''}" data-palette-command="${command.id}"><i class="ph-bold ${command.icon}"></i>${command.label}${command.shortcut ? `<kbd>${command.shortcut}</kbd>` : ''}</button>`).join('') || '<div class="empty-list">Команда не найдена</div>';
  document.querySelectorAll('[data-palette-command]').forEach((button) => button.addEventListener('click', () => { $('#commandPalette').close(); runCommand(button.dataset.paletteCommand); }));
}
function openCommandPalette() { closeFloating(); $('#commandSearch').value = ''; renderCommandPalette(); $('#commandPalette').showModal(); setTimeout(() => $('#commandSearch').focus(), 50); }

async function runCommand(command) {
  closeFloating();
  if (command === 'new-chat') newConversation();
  if (command === 'choose-folder') await chooseWorkspace();
  if (command === 'history') setView('history');
  if (command === 'toggle-sidebar') toggleSidebar();
  if (command === 'settings') openSettings('general');
  if (command === 'about') $('#aboutDialog').showModal();
  if (command === 'palette') openCommandPalette();
  if (command === 'minimize' || command === 'maximize' || command === 'close') api.windowAction(command);
  if (command === 'zoom-in') api.zoomAction('in');
  if (command === 'zoom-out') api.zoomAction('out');
  if (command === 'zoom-reset') api.zoomAction('reset');
}

function bindEvents() {
  $('#newChat').addEventListener('click', () => newConversation());
  $('#newChatEmpty')?.addEventListener('click', () => newConversation());
  $('#settingsButton').addEventListener('click', () => openSettings('general'));
  $('#historyButton').addEventListener('click', () => setView('history'));
  $('#backButton').addEventListener('click', () => navigate(-1));
  $('#forwardButton').addEventListener('click', () => navigate(1));
  $('#toggleSidebar').addEventListener('click', toggleSidebar);
  $('#teamRoomToggle').addEventListener('click', () => {
    state.teamRoomCollapsed = !state.teamRoomCollapsed;
    localStorage.setItem('xacode.teamRoomCollapsed', String(state.teamRoomCollapsed));
    renderTeamRoom();
  });
  $('#teamRoomStop').addEventListener('click', async () => {
    const conversation = activeConversation();
    if (!conversation || !isConversationRunning(conversation.id)) return;
    await api.stopAgent(conversation.id);
    toast('Команда останавливается');
  });
  setInterval(updateTeamRoomElapsed, 1000);
  $('#imageZoomOut').addEventListener('click', () => setImageViewerZoom(imageViewerZoom - 0.25));
  $('#imageZoomIn').addEventListener('click', () => setImageViewerZoom(imageViewerZoom + 0.25));
  $('#imageZoomReset').addEventListener('click', () => setImageViewerZoom(1));
  $('#imageViewerClose').addEventListener('click', closeImageViewer);
  $('#imageViewerDialog').addEventListener('cancel', (event) => { event.preventDefault(); closeImageViewer(); });
  $('#imageViewerDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeImageViewer(); });
  $('#imageViewerStage').addEventListener('wheel', (event) => { if (!event.ctrlKey) return; event.preventDefault(); setImageViewerZoom(imageViewerZoom + (event.deltaY < 0 ? 0.25 : -0.25)); }, { passive: false });
  $('#imageViewerImage').addEventListener('dblclick', () => setImageViewerZoom(imageViewerZoom === 1 ? 2 : 1));
  $('#sidebarRestore').addEventListener('click', toggleSidebar);
  $('#mobileSidebar').addEventListener('click', toggleSidebar);
  $('#chatProjectName').addEventListener('click', () => { const workspace = activeConversation()?.workspace || state.workspace; if (!workspace) return; state.workspace = workspace; newConversation(); });
  $('#workspacePicker').addEventListener('click', showWorkspacePopover);
  $('#browseWorkspace').addEventListener('click', async () => { closeFloating(); await chooseWorkspace(); });
  $('#modelButton').addEventListener('click', showModelPopover);
  $('[data-open-model-settings]').addEventListener('click', () => openSettings('models'));
  $('#attachButton').addEventListener('click', () => togglePopover($('#contextPopover')));
  document.addEventListener('click', async (event) => {
    const stopBtn = event.target.closest('[data-stop-command]');
    if (stopBtn) {
      event.preventDefault();
      event.stopPropagation();
      try {
        await api.stopTerminal();
      } catch (e) {}
      render();
      toast('Команда отменена (агент продолжает работу)');
    }
  });
  $('#sendButton').addEventListener('click', async () => {
    if (isConversationRunning()) { await api.stopAgent(state.activeId); state.runningIds.delete(state.activeId); render(); return; }
    await sendPrompt();
  });
  $('#openProjectButton').addEventListener('click', () => openWorkspaceWith('explorer'));
  $('#openProjectMenuButton').addEventListener('click', (event) => { event.stopPropagation(); showProjectLauncherMenu(); });
  $('#historySearch').addEventListener('input', renderHistory);
  $('#historyFilter').addEventListener('click', (event) => { event.stopPropagation(); const anchor = event.currentTarget; const menu = $('#historyFilterMenu'); const opening = menu.classList.contains('hidden'); closeFloating(menu); menu.classList.toggle('hidden', !opening); if (opening) requestAnimationFrame(() => { const rect = anchor.getBoundingClientRect(); menu.style.left = `${Math.min(window.innerWidth - menu.offsetWidth - 10, rect.left)}px`; menu.style.top = `${rect.bottom + 6}px`; }); });
  document.querySelectorAll('[data-history-status]').forEach((input) => input.addEventListener('change', () => { state.historyStatuses[input.dataset.historyStatus] = input.checked; renderHistory(); }));
  $('#historyFilterMenu').addEventListener('click', (event) => event.stopPropagation());
  $('#addInstructionProfile').addEventListener('click', (event) => { event.preventDefault(); createInstructionProfile(); });
  $('#instructionNameInput').addEventListener('input', () => { const profile = saveInstructionDraft(); if (!profile) return; $('#editingInstructionTitle').textContent = profile.name; renderInstructionProfiles(); });
  $('#instructionPromptInput').addEventListener('input', saveInstructionDraft);
  $('#activateInstructionProfile').addEventListener('click', (event) => { event.preventDefault(); const profile = saveInstructionDraft(); if (!profile) return; state.settings.activeInstructionProfileId = profile.id; state.settings.customInstructionsEnabled = true; $('#customInstructionsEnabled').checked = true; renderInstructionProfiles(); fillInstructionProfile(); toast(`Активные инструкции: ${profile.name}`); });
  $('#temperatureEnabled').addEventListener('change', () => { state.settings.temperatureEnabled = $('#temperatureEnabled').checked; $('#temperatureControls').classList.toggle('disabled', !state.settings.temperatureEnabled); });
  $('#temperatureInput').addEventListener('input', () => { state.settings.temperature = Number($('#temperatureInput').value); $('#temperatureValue').textContent = state.settings.temperature.toFixed(1); });
  $('#customInstructionsEnabled').addEventListener('change', () => { state.settings.customInstructionsEnabled = $('#customInstructionsEnabled').checked; });
  $('#contextEnabledInput')?.addEventListener('change', () => { state.settings.contextEnabled = $('#contextEnabledInput').checked; void api.saveSettings(state.settings); });
  $('#compressionEnabledInput')?.addEventListener('change', () => { state.settings.compressionEnabled = $('#compressionEnabledInput').checked; void api.saveSettings(state.settings); });
  $('#compressionModeSelect')?.addEventListener('change', () => { state.settings.compressionMode = $('#compressionModeSelect').value; void api.saveSettings(state.settings); });
  $('#addModelProfile').addEventListener('click', (event) => { event.preventDefault(); createModelProfile(); });
  $('#addTeamMember')?.addEventListener('click', (event) => { event.preventDefault(); addTeamMember(); });
  $('#teamEnabledInput')?.addEventListener('change', () => { state.settings.teamEnabled = $('#teamEnabledInput').checked; renderTeamSettings(); });
  $('#teamDiscussionRoundsInput')?.addEventListener('change', () => { state.settings.teamDiscussionRounds = Number($('#teamDiscussionRoundsInput').value) || 1; });
  $('#duplicateModelProfile').addEventListener('click', (event) => { event.preventDefault(); duplicateModelProfile(); });
  $('#modelIconSearch').addEventListener('input', () => { state.modelIconVisibleCount = 48; renderModelIconPicker($('#modelIconSearch').value); });
  $('#providerInput').addEventListener('change', () => { updateProviderConstructor(true); refreshEditingProfilePreview(); });
  $('#profileNameInput').addEventListener('input', refreshEditingProfilePreview);
  $('#modelInput').addEventListener('input', refreshEditingProfilePreview);
  $('#activateModelProfile').addEventListener('click', (event) => { event.preventDefault(); const profile = saveModelProfileDraft(); if (!profile) return; state.settings.activeProfileId = profile.id; const conversation = activeConversation(); if (conversation) { conversation.modelProfileId = profile.id; persist(); } renderModelProfiles(); fillModelProfile(); render(); toast(`Модель этого чата: ${profile.name}`); });
  $('#toggleApiKey').addEventListener('click', (event) => { event.preventDefault(); const input = $('#apiKeyInput'); const show = input.type === 'password'; input.type = show ? 'text' : 'password'; event.currentTarget.innerHTML = `<i class="ph-bold ${show ? 'ph-eye-slash' : 'ph-eye'}"></i>`; });
  $('#enableHyperagentHeaderInput')?.addEventListener('change', () => syncHyperagentSecretVisibility());
  $('#enableDeepseekThinkingInput')?.addEventListener('change', () => { syncThinkingVisibility(); saveModelProfileDraft(); });
  $('#reasoningEffortInput')?.addEventListener('change', saveModelProfileDraft);
  $('#enableProtectionSystemInput')?.addEventListener('change', () => { state.settings.enableProtectionSystem = $('#enableProtectionSystemInput').checked; void api.saveSettings(state.settings); });
  $('#mcpEnabledInput')?.addEventListener('change', () => { 
    state.settings.mcpEnabled = $('#mcpEnabledInput').checked; 
    void api.saveSettings(state.settings); 
    fillPermissions();
  });

  $('#maxExecutionLoopsInput')?.addEventListener('change', () => { state.settings.maxExecutionLoops = Math.max(10, Number($('#maxExecutionLoopsInput').value) || 100); void api.saveSettings(state.settings); });
  $('#enableChromeIntegrationInput')?.addEventListener('change', () => { state.settings.enableChromeIntegration = $('#enableChromeIntegrationInput').checked; void api.saveSettings(state.settings); });

  // ─── Theme event listeners ───
  document.querySelectorAll('.theme-variant-tab').forEach(tab => tab.addEventListener('click', (e) => {
    e.preventDefault();
    const newVariant = tab.dataset.variant;
    if (!newVariant || newVariant === state.settings.themeVariant) return;
    state.settings.themeVariant = newVariant;
    const allThemes = getAllThemes();
    const sameName = allThemes.find(t => t.variant === newVariant && t.codeThemeId === (state._activeThemePreset?.codeThemeId || state.settings.activeThemeId));
    const fallback = allThemes.filter(t => t.variant === newVariant)[0] || BUILTIN_THEMES[0];
    const original = sameName || fallback;
    const next = JSON.parse(JSON.stringify(original));
    state.settings.activeThemeId = next.id;
    applyTheme(next);
    fillAppearanceSettings();
    void api.saveSettings(state.settings);
  }));
  $('#themePresetToggle')?.addEventListener('click', () => { $('#themePresetDropdown')?.classList.toggle('open'); });
  document.addEventListener('click', (e) => { const dd = $('#themePresetDropdown'); if (dd && !e.target.closest('.theme-preset-selector')) dd.classList.remove('open'); });

  // Swatch click handlers — open custom color picker
  document.querySelectorAll('.theme-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const target = swatch.dataset.colorTarget; // 'accent', 'surface', or 'ink'
      if (!target || !state._activeThemePreset) return;
      const currentColor = state._activeThemePreset.theme[target] || '#000000';
      openColorPicker(swatch, currentColor, (hex) => updateThemeColor(target, hex));
    });
  });

  // Init custom color picker canvas events
  xcpBindEvents();

  $('#themeContrastSlider')?.addEventListener('input', () => { const v = Number($('#themeContrastSlider').value); if ($('#themeContrastValue')) $('#themeContrastValue').textContent = v; const p = cloneThemeForEdit(); if (p) { p.theme.contrast = v; applyTheme(p); } });
  $('#themeFontUI')?.addEventListener('change', () => { const p = cloneThemeForEdit(); if (p) { p.theme.fonts.ui = $('#themeFontUI').value || null; applyTheme(p); } });
  $('#themeFontCode')?.addEventListener('change', () => { const p = cloneThemeForEdit(); if (p) { p.theme.fonts.code = $('#themeFontCode').value || null; applyTheme(p); } });
  $('#themeOpaqueWindows')?.addEventListener('change', () => { const p = cloneThemeForEdit(); if (p) { p.theme.opaqueWindows = $('#themeOpaqueWindows').checked; applyTheme(p); } });
  $('#themeCopyBtn')?.addEventListener('click', copyThemeString);
  $('#themeImportBtn')?.addEventListener('click', importThemeString);
  // ─── End theme listeners ───

  document.querySelectorAll('[data-permission-scope]').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); state.permissionScope = button.dataset.permissionScope; fillPermissions(); }));
  $('#useGlobalPermissions').addEventListener('click', (event) => { event.preventDefault(); useGlobalPermissionDefaults(); });
  $('#toolUseGlobalPermissions').addEventListener('click', (event) => { event.preventDefault(); useGlobalPermissionDefaults(); });
  $('#resetPermissionRules').addEventListener('click', (event) => { event.preventDefault(); const policy = currentPermissionPolicy(); policy.allowedCommands = []; policy.deniedCommands = []; policy.fileRules = []; policy.commandRules = []; savePermissionDraft(policy); });
  $('#addFileReadRule').addEventListener('click', (event) => { event.preventDefault(); const policy = currentPermissionPolicy(); policy.fileRules ||= []; policy.fileRules.push({ access: 'read', effect: 'allow', path: state.workspace || '' }); savePermissionDraft(policy); });
  $('#addFileWriteRule').addEventListener('click', (event) => { event.preventDefault(); const policy = currentPermissionPolicy(); policy.fileRules ||= []; policy.fileRules.push({ access: 'write', effect: 'allow', path: state.workspace || '' }); savePermissionDraft(policy); });
  $('#addCommandRule').addEventListener('click', (event) => { event.preventDefault(); const policy = currentPermissionPolicy(); policy.commandRules ||= []; policy.commandRules.push({ effect: 'allow', command: '' }); savePermissionDraft(policy); });
  $('#enableAllTools').addEventListener('click', (event) => { event.preventDefault(); const policy = currentPermissionPolicy(); policy.disabledTools = []; savePermissionDraft(policy); });
  ['permissionSandboxMode', 'permissionFileRead', 'permissionFileWrite', 'permissionTerminal', 'permissionNetwork'].forEach((id) => $(`#${id}`).addEventListener('change', () => { const policy = currentPermissionPolicy(); policy.sandboxMode = $('#permissionSandboxMode').value; policy.fileRead = $('#permissionFileRead').value; policy.fileWrite = $('#permissionFileWrite').value; policy.terminal = $('#permissionTerminal').value; policy.network = $('#permissionNetwork').value; savePermissionDraft(policy, false); fillPermissions(); }));
  document.querySelectorAll('[data-permission-preset]').forEach((card) => card.addEventListener('click', () => {
    const preset = card.dataset.permissionPreset;
    const policy = currentPermissionPolicy();
    if (preset === 'full') { policy.sandboxMode = 'full'; policy.terminal = 'allow'; policy.fileRead = 'allow'; policy.fileWrite = 'allow'; policy.network = 'allow'; }
    else if (preset === 'developer') { policy.sandboxMode = 'workspace'; policy.terminal = 'allow'; policy.fileRead = 'allow'; policy.fileWrite = 'allow'; policy.network = 'ask'; }
    else if (preset === 'balanced') { policy.sandboxMode = 'workspace'; policy.terminal = 'ask'; policy.fileRead = 'allow'; policy.fileWrite = 'ask'; policy.network = 'ask'; }
    else if (preset === 'strict') { policy.sandboxMode = 'strict'; policy.terminal = 'deny'; policy.fileRead = 'allow'; policy.fileWrite = 'ask'; policy.network = 'deny'; }
    savePermissionDraft(policy, true);
    toast('Пресет разрешений применён и сохранён');
  }));
  $('#settingsDialog').addEventListener('cancel', (event) => { event.preventDefault(); cancelSettings(); });
  $('#settingsAddFolder').addEventListener('click', async (event) => { event.preventDefault(); const selected = await chooseWorkspace(); if (selected) { updateSettingsProjectHeader(); renderSettingsProjects(); } });
  $('.remove-folder').addEventListener('click', async (event) => {
    event.preventDefault();
    const workspace = state.workspace;
    if (!workspace) return;
    const confirmed = await showConfirm({ title: 'Отключить папку?', message: 'Все чаты этого проекта будут удалены из истории XaCode. Файлы на диске не будут удалены.', confirmLabel: 'Отключить' });
    if (!confirmed) return;
    state.conversations = state.conversations.filter((conversation) => conversation.workspace !== workspace);
    state.activeId = state.conversations[0]?.id || null;
    state.workspace = '';
    await persist(); updateSettingsProjectHeader(); renderSettingsProjects(); render();
    toast('Проект отключен, история чатов удалена');
  });
  $('#confirmAccept').addEventListener('click', () => resolveConfirm(true));
  $('#confirmCancel').addEventListener('click', () => resolveConfirm(false));
  $('#confirmClose').addEventListener('click', () => resolveConfirm(false));
  $('#confirmDialog').addEventListener('cancel', (event) => { event.preventDefault(); resolveConfirm(false); });
  $('#settingsShowAll').addEventListener('click', (event) => { event.preventDefault(); state.showAllProjects = !state.showAllProjects; renderSettingsProjects(); });
  $('#renameProjectButton').addEventListener('click', (event) => { event.preventDefault(); if (!state.workspace) return; $('#renameProjectInput').value = state.projectAliases[state.workspace] || folderName(state.workspace); $('#renameProjectDialog').showModal(); setTimeout(() => { $('#renameProjectInput').focus(); $('#renameProjectInput').select(); }, 30); });
  $('#renameProjectCancel').addEventListener('click', () => $('#renameProjectDialog').close());
  $('#renameProjectForm').addEventListener('submit', (event) => { event.preventDefault(); const name = $('#renameProjectInput').value.trim(); if (!name || !state.workspace) return; state.projectAliases[state.workspace] = name; localStorage.setItem('xacode.projectAliases', JSON.stringify(state.projectAliases)); $('#renameProjectDialog').close(); updateSettingsProjectHeader(); renderSettingsProjects(); render(); toast('Название проекта изменено'); });
  $('#addMcpServerBtn')?.addEventListener('click', (event) => { event.preventDefault(); $('#mcpServerForm').reset(); $('#mcpServerDialog').showModal(); setTimeout(() => { $('#mcpServerNameInput').focus(); }, 30); });
  $('#mcpServerCancel')?.addEventListener('click', () => $('#mcpServerDialog').close());
  $('#mcpServerForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#mcpServerNameInput').value.trim();
    const command = $('#mcpServerCommandInput').value.trim();
    const argsStr = $('#mcpServerArgsInput').value.trim();
    if (!name || !command) return;
    const args = argsStr ? argsStr.split(/\s+/) : [];
    if (!state.settings.mcpServers) state.settings.mcpServers = {};
    state.settings.mcpServers[name] = { command, args };
    void api.saveSettings(state.settings);
    $('#mcpServerDialog').close();
    fillPermissions();
    toast('MCP Сервер добавлен');
  });
  $('#copyDiagnostics').addEventListener('click', async (event) => { event.preventDefault(); const diagnostics = `XaCode Desktop ${state.updateState.currentVersion}\nПлатформа: ${navigator.platform}\nПровайдер: ${state.settings.provider}\nМодель: ${state.settings.model}\nЧатов: ${state.conversations.length}`; await navigator.clipboard.writeText(diagnostics); toast('Диагностика скопирована'); });
  $('#openChromeExtensionFolderBtn')?.addEventListener('click', async (event) => { event.preventDefault(); if (state.chromeExtensionPath) { await api.openPath(state.chromeExtensionPath); toast('Папка расширения открыта в Проводнике'); } });
  $('#openChromeExtensionRepoBtn')?.addEventListener('click', async (event) => { event.preventDefault(); await api.openUrl('https://github.com/Xani4kaGitHub/XaCodeAppExtension'); toast('Репозиторий расширения открыт в браузере'); });
  $('#updateButton').addEventListener('click', async (event) => {
    event.preventDefault();
    const status = state.updateState.status;
    if (status === 'available') await api.downloadUpdate();
    else if (status === 'downloaded') {
      toast('Установка обновления... Приложение перезапустится через пару секунд');
      await api.installUpdate();
    }
    else renderUpdateState(await api.checkForUpdates());
  });
  document.querySelectorAll('[data-project-action]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); runProjectAction(button.dataset.projectAction); }));
  document.querySelectorAll('[data-chat-action]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); runChatAction(button.dataset.chatAction); }));
  document.querySelectorAll('[data-projects-action]').forEach((button) => button.addEventListener('click', async (event) => { event.stopPropagation(); closeFloating(); if (button.dataset.projectsAction === 'blank') await createWorkspaceConversation(); if (button.dataset.projectsAction === 'select') await selectWorkspaceConversation(); }));
  $('#securityPreset').addEventListener('change', () => { $('#permissionSandboxMode').value = $('#securityPreset').value === 'full' ? 'full' : $('#securityPreset').value === 'restricted' ? 'strict' : 'workspace'; $('#permissionSandboxMode').dispatchEvent(new Event('change', { bubbles: true })); });
  $('#reasoningPreset').addEventListener('change', () => { $('#reasoningInput').checked = $('#reasoningPreset').value === 'visible'; });
  $('#reasoningInput').addEventListener('change', () => { $('#reasoningPreset').value = $('#reasoningInput').checked ? 'visible' : 'hidden'; });

  document.querySelectorAll('[data-menu]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
    const menuName = button.dataset.menu;
    if (!menuName) return;
    const menu = $(`[data-app-menu="${menuName}"]`);
    if (!menu) return;
    const isOpening = menu.classList.contains('hidden') || !menu.classList.contains('open');
    closeFloating(menu);
    if (isOpening) {
      const rect = button.getBoundingClientRect();
      menu.style.left = `${Math.max(4, rect.left)}px`;
      menu.style.top = `${rect.bottom + 2}px`;
    }
    menu.classList.toggle('open', isOpening);
    menu.classList.toggle('hidden', !isOpening);
  }));
  document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => runCommand(button.dataset.command)));

  document.querySelectorAll('.settings-nav-item').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); if (button.dataset.settingsPage) setSettingsPage(button.dataset.settingsPage); }));
  document.querySelectorAll('[data-go-page]').forEach((control) => control.addEventListener('click', (event) => { event.preventDefault(); setSettingsPage(control.dataset.goPage); }));
  $('#closeSettingsButton')?.addEventListener('click', cancelSettings);
  $('#cancelSettingsButton')?.addEventListener('click', cancelSettings);
  $('#saveSettingsButton')?.addEventListener('click', saveSettings);
  const settingsForm = $('#settingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveSettings(event);
    });
  }
  document.querySelectorAll('[data-context-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.contextAction; closeFloating();
    if (action === 'media') await selectFiles();
    if (action === 'mention') insertTextAtCaret('@');
    if (action === 'action') insertTextAtCaret('/');
    if (action === 'browser') { addContextToken('browser'); toast('Опишите, что нужно найти в браузере'); }
    render();
  }));
  $('#commandSearch').addEventListener('input', () => renderCommandPalette($('#commandSearch').value));
  $('#commandSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') { const selected = $('.command-item.selected'); if (selected) { event.preventDefault(); $('#commandPalette').close(); runCommand(selected.dataset.paletteCommand); } } });

  const input = $('#promptInput');
  input.addEventListener('input', () => { if (input.innerHTML === '<br>' || input.innerHTML === '<div><br></div>') input.innerHTML = ''; const trigger = currentPromptTrigger(); activePromptTrigger = trigger; updateSendButton(); if (trigger?.kind === '/') { slashSelectedIndex = 0; showSlashMenu(trigger.query); } else $('#slashMenu').classList.add('hidden'); if (trigger?.kind === '@') handleMentionInput(trigger); else { $('#mentionPopover').classList.add('hidden'); mentionQuery = null; } });
  input.addEventListener('paste', async (event) => { const hasImage = [...(event.clipboardData?.items || [])].some((item) => item.type.startsWith('image/')); if (hasImage) { await pasteClipboardImage(event); return; } event.preventDefault(); insertTextAtCaret(event.clipboardData?.getData('text/plain') || ''); });
  input.addEventListener('keydown', (event) => {
  if (mentionQuery !== null && !$('#mentionPopover').classList.contains('hidden')) {
    if (event.key === 'ArrowDown') { event.preventDefault(); mentionSelectedIndex = Math.min(mentionSelectedIndex + 1, mentionItems.length - 1); showMentionPopover(); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); mentionSelectedIndex = Math.max(mentionSelectedIndex - 1, 0); showMentionPopover(); return; }
    if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); activateMentionItem(mentionItems[mentionSelectedIndex]); return; }
  }
  if (!$('#slashMenu').classList.contains('hidden')) {
    if (event.key === 'ArrowDown') { event.preventDefault(); slashSelectedIndex = Math.min(slashSelectedIndex + 1, slashItems.length - 1); showSlashMenu(activePromptTrigger?.query || ''); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); slashSelectedIndex = Math.max(slashSelectedIndex - 1, 0); showSlashMenu(activePromptTrigger?.query || ''); return; }
    if ((event.key === 'Enter' || event.key === 'Tab') && slashItems[slashSelectedIndex]) { event.preventDefault(); addContextToken(slashItems[slashSelectedIndex].id); $('#slashMenu').classList.add('hidden'); return; }
  }
  if (event.key === 'Backspace' && removeAdjacentPromptToken('backward')) { event.preventDefault(); return; }
  if (event.key === 'Delete' && removeAdjacentPromptToken('forward')) { event.preventDefault(); return; }
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendPrompt(); }
});
  const composerElement = $('#composer');
  composerElement.addEventListener('dragenter', (event) => { event.preventDefault(); composerElement.classList.add('drag-active'); });
  composerElement.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; composerElement.classList.add('drag-active'); });
  composerElement.addEventListener('dragleave', (event) => { if (!composerElement.contains(event.relatedTarget)) composerElement.classList.remove('drag-active'); });
  composerElement.addEventListener('drop', async (event) => {
    event.preventDefault(); composerElement.classList.remove('drag-active');
    for (const file of [...event.dataTransfer.files]) {
      const filePath = api.getDroppedFilePath ? await api.getDroppedFilePath(file) : file.path;
      if (filePath) await addAttachment(filePath);
    }
    input.focus(); updateSendButton();
  });
  document.addEventListener('click', (event) => { if (!event.target.closest('.popover') && !event.target.closest('#workspacePicker,#modelButton,#attachButton') && !event.target.closest('.titlebar-drag')) closeFloating(); });
  document.addEventListener('mouseover', (event) => { const target = event.target.closest('[title], [data-tooltip]'); if (target) showTooltip(target); });
  document.addEventListener('mouseout', (event) => { const target = event.target.closest('[data-tooltip]'); if (target && !target.contains(event.relatedTarget)) hideTooltip(); });
  document.addEventListener('keydown', (event) => {
    if (state.pendingChoiceId && state.pendingChoiceConversationId === state.activeId && state.pendingChoiceOptions.length) {
      const optionIndex = Number(event.key) - 1;
      if (Number.isInteger(optionIndex) && state.pendingChoiceOptions[optionIndex]) { event.preventDefault(); selectInlineChoice(state.pendingChoiceOptions[optionIndex]); return; }
      if (event.key === 'Enter' && state.pendingChoiceSelection) { event.preventDefault(); answerInlineChoice(state.pendingChoiceSelection); return; }
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleSidebar(); }
    if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); newConversation(); }
    if (event.ctrlKey && event.key === ',') { event.preventDefault(); openSettings('general'); }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); openCommandPalette(); }
    if (event.ctrlKey && event.key === 'Delete') { event.preventDefault(); if (state.activeId) handleQuickChatAction('delete', state.activeId); }
    if (event.ctrlKey && event.key.toLowerCase() === 'f') { event.preventDefault(); $('#historySearch')?.focus(); }
    if (event.ctrlKey && event.key.toLowerCase() === 'j') { event.preventDefault(); $('#promptInput')?.focus(); }
    if (event.key === 'Escape') closeFloating();
  });

  api.onAgentUpdate(handleAgentUpdate);
  api.onTeamRoomUpdate?.(({ conversationId, room }) => {
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation || !room) return;
    conversation.teamRoom = room;
    conversation.updatedAt = new Date().toISOString();
    persist();
    if (conversationId === state.activeId) renderTeamRoom();
    else renderSidebar();
  });
  
  api.onStreamToken(({ conversationId, token }) => {
    const conversation = state.conversations.find((c) => c.id === conversationId);
    if (!conversation) return;
    let lastMsg = conversation.messages[conversation.messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') {
      lastMsg = { id: id('msg'), role: 'assistant', content: token, timestamp: Date.now() };
      conversation.messages.push(lastMsg);
    } else {
      lastMsg.content += token;
    }
    if (state.activeId === conversationId) {
      const article = document.querySelector(`[data-message="${lastMsg.id}"]`);
      if (article) {
        const bubble = article.querySelector('.bubble');
        if (bubble) bubble.innerHTML = simpleMarkdown(lastMsg.content);
        snapMessagesToBottom();
      } else {
        renderMessages();
      }
    }
  });
  api.onAgentContext(({ conversationId, context }) => {
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation || !context) return;
    conversation.contextUsage = context.usageTokens; conversation.contextLimit = context.maxTokens; conversation.compressionCount = context.compressionCount || 0; conversation.contextUpdatedAt = new Date().toISOString(); persist(); if (conversationId === state.activeId) renderContextIndicator();
  });
  api.onShortcut((shortcut) => { if (shortcut === 'toggle-sidebar') toggleSidebar(); });
  api.onNotificationOpen?.((conversationId) => { if (state.conversations.some((conversation) => conversation.id === conversationId)) openConversation(conversationId); });
  api.onAgentChoice(({ conversationId, requestId, question, options }) => {
    const targetConversationId = conversationId || state.activeId;
    state.pendingChoiceId = requestId;
    state.pendingChoiceConversationId = targetConversationId;
    state.pendingChoiceQuestion = String(question || '');
    state.pendingChoiceOptions = [...options];
    state.pendingChoiceSelection = options[0] || '';
    const [title, ...details] = String(question).split('\n');
    const hasOptions = options.length > 0;
    $('#inlineChoiceQuestion').textContent = title;
    $('#inlineChoiceContext').textContent = details.join('\n');
    $('#inlineChoiceContext').classList.toggle('hidden', !details.length);
    $('#inlineChoiceOptions').innerHTML = options.map((option, index) => `<button type="button" class="inline-choice-option ${index === 0 ? 'selected' : ''}" value="${escapeHtml(option)}" aria-pressed="${index === 0}"><kbd>${index + 1}</kbd><span>${escapeHtml(option)}</span><i class="ph-bold ph-check"></i></button>`).join('');
    $('#inlineChoiceOptions').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => selectInlineChoice(button.value)));
    $('#inlineChoice').classList.toggle('permission-choice', hasOptions);
    $('.inline-choice-custom').classList.toggle('hidden', hasOptions);
    $('#inlineChoiceActions').classList.toggle('hidden', !hasOptions);
    $('#inlineChoiceSubmit').disabled = !hasOptions;
    syncInlineChoiceVisibility();
    $('#inlineChoiceInput').placeholder = 'Введите ответ агенту';
    if (!hasOptions && targetConversationId === state.activeId) setTimeout(() => $('#inlineChoiceInput').focus(), 50);
    const conversation = state.conversations.find((item) => item.id === targetConversationId);
    notifyConversation(targetConversationId, 'XaCode ждёт вашего ответа', title || conversation?.title || 'Нужно подтверждение');
  });
  $('#sendChoice').addEventListener('click', (event) => { event.preventDefault(); const choice = $('#customChoice').value.trim(); if (choice && state.pendingChoiceId) api.answerChoice(state.pendingChoiceId, choice); $('#choiceDialog').close(); });
  $('#inlineChoiceSend').addEventListener('click', () => answerInlineChoice($('#inlineChoiceInput').value.trim()));
  $('#inlineChoiceSubmit').addEventListener('click', () => answerInlineChoice(state.pendingChoiceSelection));
  $('#inlineChoiceSkip').addEventListener('click', () => answerInlineChoice(state.pendingChoiceOptions.at(-1) || 'Пропустить'));
  $('#inlineChoiceInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); answerInlineChoice(event.currentTarget.value.trim()); } });
  initSidebarResize();
}

function dismissSplash() {
  const splash = $('#appSplash');
  if (splash && !splash.classList.contains('hidden')) {
    splash.classList.add('hidden');
    setTimeout(() => { try { splash.remove(); } catch(e){} }, 450);
  }
}

setTimeout(dismissSplash, 1200);

async function bootstrap() {
  try {
    const data = await api.bootstrap();
    state.settings = data.settings || {};
    state.conversations = (data.conversations || []).filter((conversation) => !isEmptyConversation(conversation));
    let migratedConversationModels = false;
    state.conversations.forEach((conversation) => {
      if (!conversation.modelProfileId || !state.settings.modelProfiles?.some((profile) => profile.id === conversation.modelProfileId)) {
        conversation.modelProfileId = state.settings.activeProfileId;
        migratedConversationModels = true;
      }
    });
    if (migratedConversationModels) void persist();
    state.conversations.forEach(restoreConversationTokenTotal);
    state.workspace = data.workspace || '';
    state.availableTools = data.tools || [];
    state.chromeExtensionPath = data.chromeExtensionPath || '';
    state.updateState = data.updateState || { status: 'idle', currentVersion: data.appVersion || '1.11.50' };
    state.updateState.currentVersion = data.appVersion || state.updateState.currentVersion;
    renderUpdateState();
    api.onUpdateStatus?.((update) => renderUpdateState(update));
    
    if ($('#appPlatformText')) {
      let platformStr = data.platform;
      if (data.platform === 'win32') {
        const releaseParts = (data.osRelease || '').split('.');
        const buildNumber = parseInt(releaseParts[2] || releaseParts[1] || '0', 10);
        const winVersion = buildNumber >= 22000 ? '11' : '10';
        platformStr = `Windows ${winVersion} (${data.osRelease || ''} ${data.arch || ''})`.trim();
      } else {
        let platformName = data.platform === 'darwin' ? 'macOS' : data.platform === 'linux' ? 'Linux' : data.platform;
        platformStr = `${platformName} ${data.osRelease || ''} ${data.arch || ''}`.trim();
      }
      $('#appPlatformText').textContent = platformStr;
    }
    if ($('#appHomeDirText')) {
      $('#appHomeDirText').textContent = data.homeDir || '';
    }
    const openDataDirBtn = $('#openDataDirButton');
    if (openDataDirBtn && data.homeDir) {
      openDataDirBtn.addEventListener('click', (e) => { e.preventDefault(); api.openPath(data.homeDir); });
    }
    const openSourceCodeBtn = $('#openSourceCodeButton');
    if (openSourceCodeBtn) {
      openSourceCodeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const tempLink = document.createElement('a');
        tempLink.href = 'https://github.com/Xani4kaGitHub/XaCodeApp';
        tempLink.target = '_blank';
        tempLink.click();
      });
    }

    const savedConversationId = localStorage.getItem('xacode.lastConversationId');
    state.activeId = state.conversations.some((conversation) => conversation.id === savedConversationId) ? savedConversationId : state.conversations[0]?.id || null;
    const conversation = activeConversation();
    if (conversation?.modelProfileId) state.settings.activeProfileId = conversation.modelProfileId;
    const savedView = localStorage.getItem('xacode.lastView');
    state.view = state.conversations.length && ['conversation', 'history'].includes(savedView) ? savedView : 'conversation';
    state.navigation = [state.view];
    state.navigationIndex = 0;
    bindEvents();
    // Apply saved theme before first render (no flash)
    try {
      const themeVariant = state.settings.themeVariant || localStorage.getItem('xacode.themeVariant') || 'dark';
      const themeId = state.settings.activeThemeId || localStorage.getItem('xacode.activeThemeId') || 'xacode';
      state.settings.themeVariant = themeVariant;
      state.settings.activeThemeId = themeId;
      const bootThemeOriginal = getAllThemes().find(t => t.id === themeId && t.variant === themeVariant) || BUILTIN_THEMES[0];
      applyTheme(JSON.parse(JSON.stringify(bootThemeOriginal)));
    } catch(e) { console.error('Theme init error:', e); }
    document.documentElement.style.setProperty('--sidebar-width', `${state.sidebarWidth}px`);
    if (localStorage.getItem('xacode.sidebarCollapsed') === 'true') setSidebarCollapsed(true);
    render();

    void api.getWorkspaceLaunchers().then((launchers) => {
      state.workspaceLaunchers = launchers || [];
      const explorerLauncher = state.workspaceLaunchers.find((launcher) => launcher.id === 'explorer');
      if (explorerLauncher?.icon && $('#openProjectButton')) $('#openProjectButton').innerHTML = `<img src="${explorerLauncher.icon}" alt="Проводник" />`;
    }).catch(() => {});
  } finally {
    dismissSplash();
    if (state.settings && !state.settings.apiKey) setTimeout(() => openSettings('models'), 300);
  }
}

bootstrap().catch((error) => toast(`Не удалось запустить XaCode: ${error.message}`));
let mentionQuery = null;
let mentionResults = [];
let mentionItems = [];
let mentionSelectedIndex = 0;
let mentionRequestSerial = 0;
let slashItems = [];
let slashSelectedIndex = 0;

const mentionQuickItems = [
  { type: 'action', id: 'files', section: 'Добавить', label: 'Файлы и папки', description: 'Выбрать контекст с компьютера', icon: 'ph-paperclip' },
  { type: 'command', id: 'goal', section: 'Добавить', label: 'Цель', description: 'Поставить цель и двигаться до её завершения', icon: 'ph-target' },
  { type: 'command', id: 'plan', section: 'Добавить', label: 'Режим планирования', description: 'Сначала продумать шаги и риски', icon: 'ph-lightbulb' },
  { type: 'command', id: 'browser', section: 'Инструменты', label: 'Браузер', description: 'Найти или проверить информацию в интернете', icon: 'ph-globe' },
  { type: 'command', id: 'chrome', section: 'Инструменты', label: 'Google Chrome', description: 'Управление вашим Google Chrome браузером через расширение', icon: 'ph-globe-hemisphere-west' },
  { type: 'command', id: 'terminal', section: 'Инструменты', label: 'Терминал', description: 'Выполнить команды в проекте', icon: 'ph-terminal-window' },
  { type: 'command', id: 'image', section: 'Инструменты', label: 'Изображения', description: 'Создать или отредактировать изображение', icon: 'ph-image-square' },
  { type: 'command', id: 'documents', section: 'Инструменты', label: 'Документы', description: 'Создать или изменить документ', icon: 'ph-file-doc' },
  { type: 'command', id: 'pdf', section: 'Инструменты', label: 'PDF', description: 'Прочитать, создать или проверить PDF', icon: 'ph-file-pdf' },
  { type: 'command', id: 'spreadsheets', section: 'Инструменты', label: 'Таблицы', description: 'Работать с Excel, CSV и данными', icon: 'ph-table' },
  { type: 'command', id: 'presentations', section: 'Инструменты', label: 'Презентации', description: 'Создать или изменить презентацию', icon: 'ph-presentation-chart' },
  { type: 'command', id: 'review', section: 'Разработка', label: 'Ревью кода', description: 'Найти ошибки и слабые места', icon: 'ph-magnifying-glass' },
  { type: 'command', id: 'fix', section: 'Разработка', label: 'Исправить ошибку', description: 'Найти причину, исправить и проверить', icon: 'ph-wrench' },
  { type: 'command', id: 'test', section: 'Разработка', label: 'Тестирование', description: 'Запустить проверки и разобрать сбои', icon: 'ph-check-circle' },
  { type: 'command', id: 'explain', section: 'Разработка', label: 'Объяснить', description: 'Понятно объяснить код или тему', icon: 'ph-chalkboard-teacher' },
  { type: 'command', id: 'team', section: 'Режимы', label: 'Команда моделей', description: 'Запустить 2–4 настроенные модели вместе', icon: 'ph-users-three' },
  { type: 'command', id: 'teamwork-preview', section: 'Режимы', label: 'Командная работа', description: 'Разделить большую задачу между ролями', icon: 'ph-tree-structure' },
  { type: 'command', id: 'learn', section: 'Режимы', label: 'Обучение', description: 'Сохранить полезное правило из результата', icon: 'ph-graduation-cap' },
];

async function handleMentionInput(trigger = currentPromptTrigger()) {
  if (trigger?.kind === '@') {
    activePromptTrigger = trigger;
    mentionQuery = trigger.query;
    const requestSerial = ++mentionRequestSerial;
    const workspace = activeConversation()?.workspace || state.workspace;
    if (workspace && mentionQuery) {
      try {
        const results = await api.searchFiles({ workspace, query: mentionQuery });
        if (requestSerial !== mentionRequestSerial || mentionQuery !== trigger.query) return;
        mentionResults = results;
        mentionSelectedIndex = 0;
        showMentionPopover();
      } catch (err) {
        $('#mentionPopover').classList.add('hidden');
      }
    } else { mentionResults = []; mentionSelectedIndex = 0; showMentionPopover(); }
  } else {
    mentionRequestSerial += 1;
    $('#mentionPopover').classList.add('hidden');
    mentionQuery = null;
  }
}

function showMentionPopover() {
  const menu = $('#mentionPopover');
  const query = String(mentionQuery || '').toLowerCase();
  const quickItems = mentionQuickItems.filter((item) => !query || `${item.label} ${item.description} ${item.id}`.toLowerCase().includes(query));
  const fileItems = mentionResults.slice(0, 12).map((file) => ({ type: 'file', section: 'Файлы проекта', path: file, label: folderName(file), description: file, icon: isImagePath(file) ? 'ph-image' : 'ph-file-code' }));
  mentionItems = [...quickItems, ...fileItems];
  if (!mentionItems.length) {
    menu.innerHTML = '<div class="mention-empty"><i class="ph-bold ph-magnifying-glass"></i><span>Ничего не найдено</span><small>Попробуйте изменить запрос после @</small></div>';
    menu.classList.remove('hidden');
    return;
  }
  mentionSelectedIndex = Math.min(mentionSelectedIndex, mentionItems.length - 1);
  let section = '';
  menu.innerHTML = mentionItems.map((item, index) => {
    const heading = item.section !== section ? `<div class="mention-section-label">${escapeHtml(item.section)}</div>` : '';
    section = item.section;
    return `${heading}<button type="button" class="mention-option ${index === mentionSelectedIndex ? 'active' : ''}" data-mention-index="${index}"><span class="mention-option-icon"><i class="ph-bold ${item.icon}"></i></span><span class="mention-option-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)}</small></span></button>`;
  }).join('');
  menu.classList.remove('hidden');
  keepMenuSelectionVisible(menu);
  menu.querySelectorAll('.mention-option').forEach((button) => button.addEventListener('click', () => activateMentionItem(mentionItems[Number(button.dataset.mentionIndex)])));
}

function removePromptTrigger(replacement = '') {
  const editor = $('#promptInput');
  const range = activePromptTrigger?.range;
  if (range) {
    range.deleteContents();
    const node = document.createTextNode(replacement);
    range.insertNode(node); range.setStart(node, node.textContent.length); range.collapse(true);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  }
  updateSendButton();
  $('#mentionPopover').classList.add('hidden');
  $('#slashMenu').classList.add('hidden');
  mentionQuery = null;
  mentionRequestSerial += 1;
  activePromptTrigger = null;
  editor.focus();
}

async function activateMentionItem(item) {
  if (!item) return;
  if (item.type === 'file') { await selectMention(item.path); return; }
  if (item.type === 'action' && item.id === 'files') { removePromptTrigger(''); await selectFiles(); return; }
  if (item.type === 'command') addContextToken(item.id);
}

async function selectMention(filePath) {
  insertPromptToken({ type: 'file', path: filePath, label: folderName(filePath), icon: isImagePath(filePath) ? 'ph-image' : 'ph-file-code' });
}


async function copyTextToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (successful) return true;
  } catch (e) {}

  return false;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.code-copy-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  const container = btn.closest('.code-block-wrapper') || btn.closest('pre') || btn.closest('.mermaid-card');
  const codeEl = container?.querySelector('code');
  const textToCopy = codeEl ? codeEl.textContent : '';

  const ok = await copyTextToClipboard(textToCopy);
  const icon = btn.querySelector('i');
  const span = btn.querySelector('span');

  if (ok) {
    if (icon) icon.className = 'ph-bold ph-check';
    if (span) span.textContent = 'Скопировано';
    toast('Код скопирован в буфер');
  } else {
    toast('Не удалось скопировать код');
  }

  setTimeout(() => {
    if (icon) icon.className = 'ph-bold ph-copy';
    if (span) span.textContent = 'Копировать';
  }, 2000);
});

async function loadChromeAuthToken() {
  const tokenDisplay = $('#chromeAuthTokenDisplay');
  if (!tokenDisplay || !api.getChromeAuthToken) return;
  try {
    const token = await api.getChromeAuthToken();
    tokenDisplay.value = token || '';
  } catch (e) {}
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('#copyChromeTokenBtn');
  if (!btn) return;
  e.preventDefault();
  const input = $('#chromeAuthTokenDisplay');
  if (!input) return;
  const ok = await copyTextToClipboard(input.value);
  if (ok) {
    toast('Секретный токен скопирован в буфер');
  }
});
