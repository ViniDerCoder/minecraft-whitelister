import net from "net";

import { Rcon } from "rcon-client";
import { Server } from "./serverListManager.js";


type LogMessage = {
    message: string;
    date: number;
    type: "info" | "warning" | "error";
}

export class Whitelister {
    static whitelister: {[serverId: string]: Whitelister} = {};

    serverId: string;

    ip: string;
    port: number;
    private password: string;

    rcon: Rcon;

    keepAliveUntil: number = 0;
    private lastSuccessfulConnectionTimestamp: number | undefined;

    get lastSuccessfulConnection() {
        return this.rcon.authenticated ? Date.now() : this.lastSuccessfulConnectionTimestamp;
    }

    log: LogMessage[] = [];

    constructor(server: Server) {
        this.serverId = server.id;

        this.ip = server.ip;
        this.port = server.port;
        this.password = server.password;

        Whitelister.whitelister[this.serverId] = this;

        this.rcon = this.initRcon();
    }

    initRcon() {
        const rcon = new Rcon({
            host: this.ip,
            port: this.port,
            password: this.password
        });

        rcon.on("end", () => {
            if(this.keepAliveUntil < Date.now()) {
                this.createConnection();
            }
        });

        rcon.on("error", () => {
            this.log.push({ message: "An error occurred", date: Date.now(), type: "error" });
            if(this.keepAliveUntil < Date.now()) {
                this.createConnection();
            }
        })

        return rcon;
    }

    async createConnection() {
        if(this.rcon.authenticated) return;
        if(isPrivateOrLoopback(this.ip)) {
            this.log.push({ message: "Cannot connect to private, loopback or invalid IPs", date: Date.now(), type: "error" });
            return;
        }
        this.log.push({ message: "Creating Connection", date: Date.now(), type: "info" });
        try {
            await this.rcon.connect();
            this.lastSuccessfulConnectionTimestamp = Date.now();
        } catch(e) {
            console.log(e);
            this.log.push({ message: "An error occurred", date: Date.now(), type: "error" });
        }
    }

    async stop() {
        this.log.push({ message: "Stopping Connection", date: Date.now(), type: "info" });
        this.keepAliveUntil = 0;

        try {
            await this.rcon.end();
        } catch(e) {
            this.log.push({ message: "An error occurred", date: Date.now(), type: "error" });
        }
    }

    async createTimedConnection(ms: number) {
        this.keepAliveUntil = Date.now() + ms
        if(this.rcon.authenticated) return;

        await this.createConnection();
    }

    async whitelistPlayer(playerName: string): Promise< -1 | 0 | 1 > {
        this.log.push({ message: `Whitelisting ${playerName}`, date: Date.now(), type: "info" });

        try {
            const response = await this.rcon.send(`whitelist add ${playerName}`);
            if(response.includes("Added")) return 1;
            else if(response.includes("Player is already whitelisted")) {
                this.log.push({ message: `Player ${playerName} is already whitelisted`, date: Date.now(), type: "warning" });
                return 0;
            } else {
                this.log.push({ message: `An error occurred while whitelisting ${playerName}`, date: Date.now(), type: "error" });
                return -1;
            }
        } catch(e) {
            this.log.push({ message: `An error occurred while whitelisting ${playerName}`, date: Date.now(), type: "error" });
            return -1;
        }
    }

    async unwhitelistPlayer(playerName: string): Promise< -1 | 0 | 1 > {
        this.log.push({ message: `Unwhitelisting ${playerName}`, date: Date.now(), type: "info" });

        try {
            const response = await this.rcon.send(`whitelist remove ${playerName}`);
            if(response.includes("Player is not whitelisted")) {
                this.log.push({ message: `Player ${playerName} is not whitelisted`, date: Date.now(), type: "warning" });
                return 0;
            } if(response.includes("Removed")) return 1;
            else {
                this.log.push({ message: `An error occurred while unwhitelisting ${playerName}`, date: Date.now(), type: "error" });
                return -1
            };
        } catch(e) {
            this.log.push({ message: `An error occurred while unwhitelisting ${playerName}`, date: Date.now(), type: "error" });
            return -1;
        }
    }

    async getWhitelistedPlayers(): Promise<string[]> {
        this.log.push({ message: `Getting Whitelisted Players`, date: Date.now(), type: "info" });

        try {
            const response = await this.rcon.send("whitelist list");
            return response.split(":")[1].trim().split(',').map(player => player.trim());
        } catch(e) {
            this.log.push({ message: `An error occurred while getting whitelisted players`, date: Date.now(), type: "error" });
            return [];
        }
    }

    async updateServerData(nIp: string, nPort: number, nPassword: string) {
        const changesMade = this.ip !== nIp || this.port !== nPort || this.password !== nPassword;

        if(changesMade) {
            this.log.push({ message: "Updating Server Data", date: Date.now(), type: "info" });

            this.ip = nIp;
            this.port = nPort;
            this.password = nPassword;

            await this.stop();
            this.rcon = this.initRcon();
        }
    }

    async destroy() {
        this.log.push({ message: "Destroying Whitelister", date: Date.now(), type: "info" });

        this.keepAliveUntil = 0;
        await this.stop();
        delete Whitelister.whitelister[this.serverId];
    }


    static getWhitelister(serverId: string) {
        return Whitelister.whitelister[serverId];
    }
}

function isPrivateOrLoopback(ip: string): boolean {
    if (!net.isIP(ip)) return true;

    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (
            parts[0] === 10 ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            (parts[0] === 127)
        ) {
            return true;
        }
    }

    if (ip === '::1') return true;

    return false;
}