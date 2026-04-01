import adminEn from "./resources/en/admin.json";
import commonEn from "./resources/en/common.json";
import dashboardEn from "./resources/en/dashboard.json";
import homeEn from "./resources/en/home.json";
import playlistEn from "./resources/en/playlist.json";
import searchEn from "./resources/en/search.json";
import adminEs from "./resources/es/admin.json";
import commonEs from "./resources/es/common.json";
import dashboardEs from "./resources/es/dashboard.json";
import homeEs from "./resources/es/home.json";
import playlistEs from "./resources/es/playlist.json";
import searchEs from "./resources/es/search.json";
import adminFr from "./resources/fr/admin.json";
import commonFr from "./resources/fr/common.json";
import dashboardFr from "./resources/fr/dashboard.json";
import homeFr from "./resources/fr/home.json";
import playlistFr from "./resources/fr/playlist.json";
import searchFr from "./resources/fr/search.json";
import adminPtBr from "./resources/pt-br/admin.json";
import commonPtBr from "./resources/pt-br/common.json";
import dashboardPtBr from "./resources/pt-br/dashboard.json";
import homePtBr from "./resources/pt-br/home.json";
import playlistPtBr from "./resources/pt-br/playlist.json";
import searchPtBr from "./resources/pt-br/search.json";

export const i18nResources = {
  en: {
    admin: adminEn,
    common: commonEn,
    dashboard: dashboardEn,
    home: homeEn,
    playlist: playlistEn,
    search: searchEn,
  },
  es: {
    admin: adminEs,
    common: commonEs,
    dashboard: dashboardEs,
    home: homeEs,
    playlist: playlistEs,
    search: searchEs,
  },
  fr: {
    admin: adminFr,
    common: commonFr,
    dashboard: dashboardFr,
    home: homeFr,
    playlist: playlistFr,
    search: searchFr,
  },
  "pt-BR": {
    admin: adminPtBr,
    common: commonPtBr,
    dashboard: dashboardPtBr,
    home: homePtBr,
    playlist: playlistPtBr,
    search: searchPtBr,
  },
} as const;
