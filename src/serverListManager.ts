import fs from 'fs'
import { Whitelister } from './whitelister.js';

export type Server = {
    id: string;
    ip: string;
    port: number;
    password: string;
}

export type ServerUserData = {
    creator: string;
    joinPort: number;
    notes: string | null;
}

export type EditableServerUserData = {
    joinPort: number;
    notes: string | null;
}

const serverListManager = new class ServerListManager {
    private serverList: { [serverId: string]: Server } = {}
    private userServerList: { [userId: string]: {[serverId: string]: ServerUserData}  } = {}

    async createServer(server: { ip: string, port: number, password: string }, userData: ServerUserData): Promise<string> {
        return new Promise((resolve, reject) => {
            let newServerId: string
            do {
                newServerId = Math.random().toString(36).substring(2)
            } while (this.serverList[newServerId])
            
            this.serverList[newServerId] = {
                id: newServerId,
                ip: server.ip,
                port: server.port,
                password: server.password
            }

            if(!this.userServerList[userData.creator]) this.userServerList[userData.creator] = {}
            this.userServerList[userData.creator][newServerId] = { creator: userData.creator, joinPort: userData.joinPort, notes: userData.notes || null }

            fs.writeFile(`./data/servers/${newServerId}.json`, JSON.stringify({...this.serverList[newServerId], ...userData}), (err) => { err ? reject(err) : resolve(newServerId) })
        })
    }

    async editServer(serverId: string, server: { ip: string, port: number, password: string }, userData: EditableServerUserData): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const creator = this.getUserOfServer(serverId)

            this.serverList[serverId] = {
                id: serverId,
                ip: server.ip,
                port: server.port,
                password: server.password
            }

            if(creator) this.userServerList[creator][serverId] = { creator, ...userData }

            fs.writeFile(`./data/servers/${serverId}.json`, JSON.stringify({...this.serverList[serverId], ...userData, creator}), (err) => { err ? reject(err) : resolve() })
            const linkedWhitelister = Whitelister.getWhitelister(serverId)
            if(linkedWhitelister) await linkedWhitelister.updateServerData(server.ip, server.port, server.password)
        })
    }

    async deleteServer(serverId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            delete this.serverList[serverId]

            const creator = this.getUserOfServer(serverId)
            if(creator) delete this.userServerList[creator][serverId]

            const linkedWhitelister = Whitelister.getWhitelister(serverId)
            if(linkedWhitelister) linkedWhitelister.destroy()

            fs.rm(`./data/servers/${serverId}.json`, (err) => { err ? reject(err) : resolve() })
        })
    }

    getServer(serverId: string): Server | undefined {
        return this.serverList[serverId]
    }

    getServerList(): { [serverId: string]: Server } {
        return this.serverList
    }

    getServerListByUser(userId: string): string[] {
        return Object.keys(this.userServerList[userId]) || []
    }

    getUserOfServer(serverId: string): string | undefined {
        return Object.keys(this.userServerList).find(user => this.userServerList[user][serverId])
    }

    getUserDataOfServer(serverId: string): ServerUserData | undefined {
        const user = this.getUserOfServer(serverId)
        if(user) return this.userServerList[user][serverId]
    }

    loadServerList(): void {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data');
        if (!fs.existsSync('./data/servers')) fs.mkdirSync('./data/servers');

        fs.readdirSync('./data/servers').forEach(file => {
            const server = JSON.parse(fs.readFileSync(`./data/servers/${file}`, 'utf-8'))
            
            this.serverList[server.id] = {
                id: server.id,
                ip: server.ip,
                port: server.port,
                password: server.password
            }
            if(!this.userServerList[server.creator]) this.userServerList[server.creator] = {}
            this.userServerList[server.creator][server.id] = { creator: server.creator, joinPort: server.joinPort, notes: server.notes || null }

        })
        console.log('[ServerManager] Server list loaded')
    }
}

export { serverListManager }