import { serverListManager } from "./serverListManager.js";
import { login as discordBotLogin } from "./wrapper/discordbot.js";

serverListManager.loadServerList();

discordBotLogin();