import log from 'loglevel';
import * as path from 'path';
import * as url from 'url';
import { app, BrowserWindow, Menu, protocol, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

import DefiProcessManager from './services/defiprocessmanager';
import AppMenu from './menus';
import { Options, parseOptions } from './clioptions';
import { initiateIpcEvents } from './ipc-events/index';
import {
  ICON,
  DARWIN,
  TITLE_BAR_STYLE,
  BACKGROUND_COLOR,
  READY,
  WINDOW_ALL_CLOSED,
  ACTIVATE,
  CLOSE,
  SECOND_INSTANCE,
  DISCLAIMER_DIALOG_TIMER,
} from './constants';
import initiateElectronUpdateManager from './ipc-events/electronupdatemanager';

declare var process: {
  argv: any;
  env: {
    NODE_ENV: string;
    npm_package_name: string;
    [key: string]: string | undefined;
  };
  platform: string;
  mas: boolean;
};

export default class App {
  mainWindow: Electron.BrowserWindow;
  allowQuit: boolean;
  parseOptions: Options;

  constructor() {
    this.parseOptions = parseOptions();
    log.setDefaultLevel(this.parseOptions.logLevel);
    if (process.mas) app.setName(process.env.npm_package_name);
    this.allowQuit = false;
    autoUpdater.autoDownload = false;
    /* For future purpose */
    initiateElectronUpdateManager(autoUpdater);
  }

  run() {
    app.allowRendererProcessReuse = false;
    app.on(READY, this.onAppReady);
    app.on(WINDOW_ALL_CLOSED, this.onAllAppWindowClose);
    app.on(ACTIVATE, this.onAppActivate);
    this.makeSingleInstance();
  }

  onAppReady = () => {
    this.initiateInterceptFileProtocol();
    this.createWindow();
    this.createMenu();
    // initiate ipcMain events
    initiateIpcEvents();

    /* For future purpose */
    autoUpdater.checkForUpdatesAndNotify().catch((e) => {
      log.error(e);
    });
  };

  initiateInterceptFileProtocol() {
    protocol.interceptFileProtocol('file', (request, callback) => {
      /* all urls start with 'file://' */
      const fileUrl = request.url.substr(7);
      const basePath = path.normalize(`${__dirname}/../../../webapp`);
      if (process.env.NODE_ENV === 'development') {
        callback(path.normalize(`${basePath}/build/release/${fileUrl}`));
      } else {
        callback(path.normalize(`${basePath}/${fileUrl}`));
      }
    });
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      minWidth: 640,
      minHeight: 480,
      title: app.name,
      titleBarStyle: TITLE_BAR_STYLE,
      backgroundColor: BACKGROUND_COLOR,
      movable: true,
      icon: ICON,
      webPreferences: {
        nodeIntegration: true,
        webSecurity: false,
      },
    });

    const loadUrl =
      process.env.ELECTRON_START_URL ||
      url.format({
        pathname: './index.html',
        protocol: 'file:',
        slashes: true,
      });

    this.mainWindow.loadURL(loadUrl);

    if (this.parseOptions.debug) {
      this.mainWindow.webContents.openDevTools();
    }

    /* Only for alpha and beta releases
       Remove this disclaimer dialog later
    */
    setTimeout(this.openDisclaimerDialog, DISCLAIMER_DIALOG_TIMER);

    this.mainWindow.on(CLOSE, this.onMainWindowClose);
  }

  openDisclaimerDialog = () => {
    const options = {
      type: 'warning',
      title: 'Disclaimer',
      message: `This is testing version of defi app, use at your own risk?`,
      buttons: ['I understand', 'Close App'],
    };

    dialog.showMessageBox(options).then((result) => {
      if (result.response === 1) {
        const options = {
          type: 'question',
          title: 'Close App',
          message: `Are you sure you want to quit?`,
          buttons: ['Cancel', 'Quit'],
        };

        dialog.showMessageBox(options).then((result) => {
          if (result.response === 1) {
            app.quit();
          }
        });
      }
    });
  };

  // Create menu
  createMenu() {
    const appMenu = new AppMenu();
    const template = appMenu.getTemplate();
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  // When app will close
  onAllAppWindowClose = () => {
    if (process.platform !== DARWIN) {
      app.quit();
    }
  };

  onAppActivate = () => {
    if (this.mainWindow === null) {
      this.createWindow();
    }
  };

  makeSingleInstance() {
    if (process.mas) return;
    app.requestSingleInstanceLock();
    app.on(SECOND_INSTANCE, () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.focus();
      }
    });
  }

  onMainWindowClose = async (event: Electron.Event) => {
    if (this.allowQuit) {
      app.quit();
      return (this.mainWindow = null);
    }
    // Stop all process before quit
    this.mainWindow.webContents.send('kill-queue');

    this.mainWindow.hide();
    event.preventDefault();
    const defiProcessManager = new DefiProcessManager();
    await defiProcessManager.stop();
    this.allowQuit = true;
    return app.quit();
  };
}
