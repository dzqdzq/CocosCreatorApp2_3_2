const e = require("electron");
const t = require("fire-url");
const i = require("fire-fs");
const n = require("lodash");
const s = require("events");
const c = require("./editor");
const v = require("./protocol");
const y = require("../app");
const m = require("../profile");
const W = require("./console");
const g = require("./menu");
const b = require("./ipc");
const _ = require("./package");

const { BrowserWindow, ipcMain } = e;

const a = "1.1.1";
const r = 100;
let l = [];
let d = null;
let h = "";
let u = null;
let w = [];
const p = "auto";
class f extends s {
  constructor(t, s) {
    super();
    s = s || {};

    n.defaultsDeep(s, {
        windowType: "dockable",
        width: 400,
        height: 300,
        acceptFirstMouse: true,
        disableAutoHideCursor: true,
        backgroundColor: "#333",
        webPreferences: {
          enableRemoteModule: true,
          contextIsolation: false,
          nodeIntegration: true,
          webviewTag: true,
          backgroundThrottling: false,
          preload: v.url("editor-framework://renderer.js"),
        },
        defaultFontSize: 13,
        defaultMonospaceFontSize: 13,
      });

    this._loaded = false;
    this._currentSessions = {};
    this._panels = [];
    this._layout = null;

    if (d) {
      let e = d.get("windows");

      if (e && e[t]) {
        this._layout = e[t].layout;
      }
    }

    this.name = t;
    this.hideWhenBlur = false;
    this.windowType = s.windowType;
    this.save = s.save;

    if (typeof this.save != "boolean") {
      this.save = true;
    }

    switch (this.windowType) {
      case "dockable": {
        s.resizable = true;
        s.alwaysOnTop = false;
        break;
      }
      case "float": {
        s.resizable = true;
        s.alwaysOnTop = true;
        break;
      }
      case "fixed-size": {
        s.resizable = false;
        s.alwaysOnTop = true;
        break;
      }
      case "quick": {
        s.resizable = true;
        s.alwaysOnTop = true;
        this.hideWhenBlur = true;
      }
    }

    this.nativeWin = new BrowserWindow(s);

    if (s.x === undefined && s.y === undefined && f.main) {
      let t = e.screen.getDisplayMatching(f.main.nativeWin.getBounds());
      let i = this.nativeWin.getSize();
      let n = 0.5 * (t.workArea.width - i[0]);
      let s = 0.5 * (t.workArea.height - i[1]);
      n = Math.floor(n);
      s = Math.floor(s);

      if (n < 0 || s < 0) {
        this.nativeWin.setPosition(t.workArea.x, t.workArea.y),
          setImmediate(() => {
            this.nativeWin.center();
          });
      } else {
        this.nativeWin.setPosition(n, s);
      }
    }

    if (this.hideWhenBlur) {
      this.nativeWin.setAlwaysOnTop(true);
    }

    this.nativeWin.on("focus", () => {
      if (!y.focused) {
        (y.focused = true), y.emit("focus");
      }
    });

    this.nativeWin.on("blur", () => {
      setImmediate(() => {
        if (!BrowserWindow.getFocusedWindow()) {
          (y.focused = false), y.emit("blur");
        }
      });

      if (this.hideWhenBlur) {
        this.nativeWin.hide();
      }
    });

    this.nativeWin.on("close", (e) => {
      if (this.windowType === "quick") {
        e.preventDefault(), this.nativeWin.hide();
      }

      f._saveWindowStates();
    });

    this.nativeWin.on("closed", () => {
      for (let e in this._currentSessions) {
        b._closeSessionThroughWin(e);
        let t = this._currentSessions[e];

        if (t) {
          t();
        }
      }
      this._currentSessions = {};

      if (this.isMainWindow) {
        f.removeWindow(this), (f.main = null), c._quit();
      } else {
        f.removeWindow(this);
      }

      this.dispose();
    });

    this.nativeWin.on("unresponsive", (e) => {
      W.error(`Window "${this.name}" unresponsive: ${e}`);
    });

    this.nativeWin.webContents.on("dom-ready", () => {
      ["theme://globals/common.css", "theme://globals/layout.css"].forEach(
        (e) => {
          let t = i.readFileSync(c.url(e), "utf8");
          this.nativeWin.webContents.insertCSS(t);
        }
      );
    });

    this.nativeWin.webContents.on("did-finish-load", () => {
      this._loaded = true;
    });

    this.nativeWin.webContents.on("crashed", (e) => {
      W.error(`Window "${this.name}" crashed: ${e}`);
    });

    this.nativeWin.webContents.on("will-navigate", (t, i) => {
      t.preventDefault();
      e.shell.openExternal(i);
    });

    f.addWindow(this);
  }
  dispose() {
    this.nativeWin = null;
  }
  load(e, n) {
    let s = v.url(e);
    if (!s) {
      W.error(`Failed to load page ${e} for window "${this.name}"`);
      return undefined;
    }
    this._url = e;
    this._loaded = false;
    let o = n ? encodeURIComponent(JSON.stringify(n)) : undefined;
    if (i.existsSync(s)) {
      s = t.format({ protocol: "file", pathname: s, slashes: true, hash: o });
      this.nativeWin.loadURL(s);
      return undefined;
    }

    if (o) {
      s = `${s}#${o}`;
    }

    this.nativeWin.loadURL(s);
  }
  show() {
    this.nativeWin.show();
  }
  hide() {
    this.nativeWin.hide();
  }
  close() {
    this._loaded = false;
    this.nativeWin.close();
  }
  forceClose() {
    this._loaded = false;
    f._saveWindowStates();

    if (this.nativeWin) {
      this.nativeWin.destroy();
    }
  }
  focus() {
    this.nativeWin.focus();
  }
  minimize() {
    this.nativeWin.minimize();
  }
  restore() {
    this.nativeWin.restore();
  }
  openDevTools(e) {
    e = e || { mode: "detach" };
    this.nativeWin.openDevTools(e);
  }
  closeDevTools() {
    this.nativeWin.closeDevTools();
  }
  adjust(t, i, n, s) {
    let o = false;

    if (typeof t != "number") {
      (o = true), (t = 0);
    }

    if (typeof i != "number") {
      (o = true), (i = 0);
    }

    if (typeof n != "number" || n <= 0) {
      (o = true), (n = 800);
    }

    if (typeof s != "number" || s <= 0) {
      (o = true), (s = 600);
    }

    let a = e.screen.getDisplayMatching({ x: t, y: i, width: n, height: s });
    this.nativeWin.setSize(n, s);
    this.nativeWin.setPosition(a.workArea.x, a.workArea.y);

    if (!o) {
      let a_workArea = a.workArea;
      let s = a_workArea.x + r;
      let a_workArea_y = a_workArea.y;
      let d = a_workArea.x + (a_workArea.width - r);
      let h = a_workArea.y + (a_workArea.height - r);

      if (t + n <= s || t >= d || i <= a_workArea_y || i >= h) {
        o = true;
      }
    }

    if (o) {
      this.nativeWin.center();
    } else {
      this.nativeWin.setPosition(t, i);
    }
  }
  resetLayout(e, t) {
    let n;
    let s = c.url(e);

    if (!s) {
      s = c.url(h);
    }

    try {
      n = JSON.parse(i.readFileSync(s));
    } catch (e) {
      c.error(`Failed to load default layout: ${e.message}`);
      n = null;
    }

    if (n) {
      b._closeAllSessions(), this.send("editor:reset-layout", n, true, t);
    }
  }
  emptyLayout() {
    b._closeAllSessions();
    this.send("editor:reset-layout", null);
  }
  _send(...e) {
    let t = this.nativeWin.webContents;
    return t
      ? (t.send(...e), true)
      : (W.error(
          `Failed to send "${e[0]}" to ${this.name} because web contents are not yet loaded`
        ),
        false);
  }
  _sendToPanel(e, t, ...i) {
    if (typeof t != "string") {
      W.error(`The message ${t} sent to panel ${e} must be a string`);
      return undefined;
    }
    let n = b._popReplyAndTimeout(i, b.debug);
    if (!n) {
      i = ["editor:ipc-main2panel", e, t, ...i];

      if (this._send(...i) === false) {
        W.failed(
          `send message "${t}" to panel "${e}" failed, no response received.`
        );
      }

      return undefined;
    }
    let s = b._newSession(t, `${e}@main`, n.reply, n.timeout, this);
    this._currentSessions[s] = n.reply;

    i = [
      "editor:ipc-main2panel",
      e,
      t,
      ...i,
      b.option({ sessionId: s, waitForReply: true, timeout: n.timeout }),
    ];

    this._send(...i);
    return s;
  }
  _closeSession(e) {
    if (this.nativeWin) {
      delete this._currentSessions[e];
    }
  }
  _addPanel(e) {
    if (!this._panels.includes(e)) {
      this._panels.push(e);
    }
  }
  _removePanel(e) {
    let t = this._panels.indexOf(e);

    if (-1 !== t) {
      this._panels.splice(t, 1);
    }
  }
  _removeAllPanels() {
    this._panels = [];
  }
  send(e, ...t) {
    if (typeof e != "string") {
      W.error(`Send message failed for '${e}'. The message must be a string`);
      return undefined;
    }
    let i = b._popReplyAndTimeout(t, b.debug);
    if (!i) {
      t = [e, ...t];

      if (this._send(...t) === false) {
        W.failed(
          `send message "${e}" to window failed. No response was received.`
        );
      }

      return undefined;
    }
    let n = b._newSession(
      e,
      `${this.nativeWin.id}@main`,
      i.reply,
      i.timeout,
      this
    );
    this._currentSessions[n] = i.reply;

    t = [
      "editor:ipc-main2renderer",
      e,
      ...t,
      b.option({ sessionId: n, waitForReply: true, timeout: i.timeout }),
    ];

    this._send(...t);
    return n;
  }
  popupMenu(e, t, i) {
    if (t !== undefined) {
      t = Math.floor(t);
    }

    if (i !== undefined) {
      i = Math.floor(i);
    }

    let n = this.nativeWin.webContents;
    let s = new g(e, n);
    s.nativeMenu.popup(this.nativeWin, t, i);
    s.dispose();
  }
  get isMainWindow() {
    return f.main === this;
  }
  get isFocused() {
    return this.nativeWin.isFocused();
  }
  get isMinimized() {
    return this.nativeWin.isMinimized();
  }
  get isLoaded() {
    return this._loaded;
  }
  get panels() {
    return this._panels;
  }
  static get defaultLayoutUrl() {
    return h;
  }
  static set defaultLayoutUrl(e) {
    h = e;
  }
  static get windows() {
    return l.slice();
  }
  static set main(e) {
    return (u = e);
  }
  static get main() {
    return u;
  }
  static find(e) {
    if (typeof e == "string") {
      for (let i of l) {
        if (i.name === e) {
          return i;
        }
      }

      return null;
    }
    if (e instanceof BrowserWindow) {
      for (let i of l) {
        if (i.nativeWin === e) {
          return i;
        }
      }

      return null;
    }

    for (let i of l) {
      if (i.nativeWin && i.nativeWin.webContents === e) {
        return i;
      }
    }

    return null;
  }
  static addWindow(e) {
    l.push(e);
  }
  static removeWindow(e) {
    let t = l.indexOf(e);
    if (-1 === t) {
      W.warn(`Cannot find window ${e.name}`);
      return undefined;
    }
    l.splice(t, 1);
  }
  static getPanelWindowState(e) {
    if (d) {
      let t = d.get(`panels.${e}`);
      if (t) {
        return { x: t.x, y: t.y, width: t.width, height: t.height };
      }
    }
    return {};
  }
  static getLabelWidth(e) {
    return d ? d.get(`panelLabelWidth.${e}`) : p;
  }
  static saveLabelWidth(e, t) {
    if (d) {
      d.set(`panelLabelWidth.${e}`, t), d.save();
    }
  }
  static _saveWindowStates(e) {
    if (c.argv._command === "test") {
      return;
    }
    if (!f.main) {
      return;
    }
    if (!d) {
      return;
    }
    d.set("version", a);
    let t = d.get("panels") || [];
    let i = {};

    for (let n of l) {
      let s = n.nativeWin.getBounds();

      if (n.save) {
        s.width ||
          (W.warn(
            `Failed to commit window state. Invalid window width: ${s.width}`
          ),
          (s.width = 800)),
          s.height ||
            (W.warn(
              `Failed to commit window state. Invalid window height ${s.height}`
            ),
            (s.height = 600)),
          (i[n.name] = {
            main: n.isMainWindow,
            url: n._url,
            windowType: n.windowType,
            x: s.x,
            y: s.y,
            width: s.width,
            height: s.height,
            layout: n._layout,
            panels: n._panels,
          });
      } else {
        i[n.name] = {};
      }

      if (!n.isMainWindow && n.panels.length === 1) {
        t[n.panels[0]] = { x: s.x, y: s.y, width: s.width, height: s.height };
      }
    }

    d.set("windows", i);
    d.set("panels", t);
    d.save();

    if (e) {
      e();
    }
  }
  static initWindowStates(e, t) {
    let i = require("../share/profile/default-layout-windows");
    m.load(t, i);

    if ((d = m.load(e)).get("version") !== a) {
      (i.version = a), d.set(null, i);
    }
  }
  static _restoreWindowStates(e) {
    if (d) {
      let t = Object.assign({}, e);
      w = [];
      let i = d.get("windows");
      for (let e in i) {
        let n;
        let i_e = i[e];

        if (v.url(i_e.url)) {
          i_e.main
            ? ((t.show = false),
              (t.windowType = i_e.windowType),
              (n = new f(e, t)),
              (f.main = n))
            : (n = new f(e, { show: false, windowType: i_e.windowType })),
            i_e.windowType === "simple" && (n._panels = i_e.panels),
            !i_e.main &&
              i_e.panels &&
              i_e.panels.length &&
              n.nativeWin.setMenuBarVisibility(false),
            n.adjust(i_e.x, i_e.y, i_e.width, i_e.height),
            i_e.main
              ? (n.show(), n.load(i_e.url))
              : w.push({ win: n, state: i_e });
        }
      }
      if (f.main) {
        f.main.focus();
        return true;
      }
    }
    return false;
  }
}
module.exports = f;

ipcMain.on("editor:ready", () => {
  while (w.length > 0) {
    let e = w.pop();

    let { win, state } = e;

    let n = state.panels[0];
    let s = _.panelInfo(n);
    win.show();

    win.load(state.url, {
      panelID: n,
      panelArgv: undefined,
      engineSupport: s && s.engineSupport,
    });
  }
});

ipcMain.on("editor:window-open", (e, t, i, n) => {
  let s = new f(t, (n = n || {}));
  s.nativeWin.setMenuBarVisibility(false);

  if (n.width && n.height) {
    s.nativeWin.setContentSize(n.width, n.height);
  }

  s.load(i, n.argv);
  s.show();
});

ipcMain.on("editor:window-query-layout", (e) => {
  let t = BrowserWindow.fromWebContents(e.sender);
  let n = f.find(t);
  if (!n) {
    W.warn("Failed to query layout, cannot find the window.");
    e.reply();
    return undefined;
  }
  let n_layout = n._layout;
  if (n.isMainWindow && !n_layout) {
    let e = v.url(h);
    if (i.existsSync(e)) {
      try {
        n_layout = JSON.parse(i.readFileSync(e));
      } catch (e) {
        W.error(`Failed to load default layout: ${e.message}`);
        n_layout = null;
      }
    }
  }
  e.reply(null, n_layout);
});

ipcMain.on("editor:window-save-layout", (e, t) => {
  let i = BrowserWindow.fromWebContents(e.sender);
  let n = f.find(i);
  if (!n) {
    W.warn("Failed to save layout, cannot find the window.");
    return undefined;
  }
  n._layout = t;

  f._saveWindowStates(() => {
    if (e.reply) {
      e.reply();
    }
  });
});

ipcMain.on("editor:update-label-width", (e, t, i) => {
  let n = BrowserWindow.fromWebContents(e.sender);
  if (!f.find(n)) {
    W.warn("Failed to save layout, cannot find the window.");
    return undefined;
  }
  f.saveLabelWidth(t, i);
});

ipcMain.on("editor:query-label-width", (e, t) => {
  let i = BrowserWindow.fromWebContents(e.sender);
  if (!f.find(i)) {
    W.warn("Failed to save layout, cannot find the window.");
    return undefined;
  }

  if (e.reply) {
    e.reply(null, f.getLabelWidth(t));
  }
});

ipcMain.on("editor:window-focus", (e) => {
  let t = BrowserWindow.fromWebContents(e.sender);
  let i = f.find(t);
  if (!i) {
    W.warn("Failed to focus, cannot find the window.");
    return undefined;
  }

  if (!i.isFocused) {
    i.focus();
  }
});

ipcMain.on("editor:window-load", (e, t, i) => {
  let n = BrowserWindow.fromWebContents(e.sender);
  let s = f.find(n);
  if (!s) {
    W.warn("Failed to focus, cannot find the window.");
    return undefined;
  }
  s.load(t, i);
});

ipcMain.on("editor:window-resize", (e, t, i, n) => {
  let s = BrowserWindow.fromWebContents(e.sender);
  let a = f.find(s);
  if (!a) {
    W.warn("Failed to focus, cannot find the window.");
    return undefined;
  }

  if (n) {
    a.nativeWin.setContentSize(t, i);
  } else {
    a.nativeWin.setSize(t, i);
  }
});

ipcMain.on("editor:window-center", (e) => {
  let t = BrowserWindow.fromWebContents(e.sender);
  let i = f.find(t);
  if (!i) {
    W.warn("Failed to focus, cannot find the window.");
    return undefined;
  }
  i.nativeWin.center();
});

ipcMain.on("editor:window-inspect-at", (e, t, i) => {
  let n = BrowserWindow.fromWebContents(e.sender);
  if (!n) {
    W.warn(`Failed to inspect at ${t}, ${i}, cannot find the window.`);
    return undefined;
  }
  n.inspectElement(t, i);

  if (n.devToolsWebContents) {
    n.devToolsWebContents.focus();
  }
});

ipcMain.on("editor:window-remove-all-panels", (e) => {
  let t = BrowserWindow.fromWebContents(e.sender);
  let i = f.find(t);
  if (!i) {
    e.reply();
    return undefined;
  }
  i._removeAllPanels();
  e.reply();
});
