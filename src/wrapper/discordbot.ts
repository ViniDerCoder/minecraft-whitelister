import { ActionRowBuilder, AnySelectMenuInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, Client, CommandInteraction, CommandInteractionOptionResolver, ComponentType, EmbedBuilder, Events, GatewayIntentBits, InteractionReplyOptions, InteractionUpdateOptions, ModalActionRowComponentBuilder, ModalBuilder, ModalSubmitInteraction, REST, Routes, SlashCommandBuilder, SlashCommandSubcommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuInteraction } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import { serverListManager } from '../serverListManager.js';
import { Whitelister } from '../whitelister.js';

dotenv.config();

const discordMinecraftLinks: { [discordId: string]: string } = JSON.parse(fs.readFileSync('./data/discordAccounts.json', 'utf8'));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});


client.once(Events.ClientReady, () => {
    console.log(`[Discord] Bot logged in as ${client.user?.tag}!`);
});

client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isCommand()) {
        const { customId } = interaction as ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

        const path = customId.split('/');
        let command = commands[path.shift() || ''];
        while (path.length > 0) {
            if (path.length > 1 && "subcommands" in command) command = command.subcommands[path.shift() || ''] || command;
            else {
                const func = path.shift() || '';
                const params: any[] = [interaction]

                const funcParamRegex = /\(([^)]+)\)/;

                command.funcs?.[func.replace(funcParamRegex, '')](...params.concat(func.match(funcParamRegex)?.[1]?.trim().split(',')));
            }
        }
        return;
    }

    const { commandName } = interaction as CommandInteraction

    if (commandName in commands) {
        const command = commands[commandName];

        if ('subcommands' in command) {
            const subcommandName = (interaction.options as CommandInteractionOptionResolver).getSubcommand();

            const subcommand = command.subcommands[subcommandName];

            if (subcommand && !("subcommands" in subcommand)) {
                subcommand.execute(interaction)
            }
        } else {
            command.execute(interaction);
        }
    }
});


function embed(str: string) {
    return new EmbedBuilder({
        title: str,
        footer: {
            text: 'Minecraft Whitelister',
        },
        color: 0x5a9a30,
    })
}

function button(label: string, style: ButtonStyle, customId: string) {
    return new ButtonBuilder({
        label: label,
        style: style,
        customId: customId,
    })
}

function buttonRow(...buttons: Array<ButtonBuilder>) {
    return new ActionRowBuilder<ButtonBuilder>({
        components: buttons,
        type: ComponentType.ActionRow,
    })
}

function select(label: string, customId: string, options: Array<{ label: string, value: string }>) {
    return new ActionRowBuilder<StringSelectMenuBuilder>({
        components: [new StringSelectMenuBuilder({
            customId: customId,
            placeholder: label,
            options: options
        })],
        type: ComponentType.ActionRow,
    })
}

export function login() {
    client.login(process.env.DISCORD_BOT_TOKEN);

    registerSlashCommands();
}

async function registerSlashCommands() {
    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN || '');

    const data = await rest.put(
        Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID || ''),
        {
            body: Object.keys(commands).map((key) => {
                const command = commands[key];
                const commandData = new SlashCommandBuilder().setName(command.name).setDescription(command.description);

                if ('options' in command && command.options) {
                    command.options.forEach((option) => addOption(commandData, option))
                }

                if ('subcommands' in command) {
                    Object.values(command.subcommands).forEach((subcommand) => {
                        commandData.addSubcommand((sc) => {
                            if ('options' in subcommand && subcommand.options) {
                                subcommand.options.forEach((option) => addOption(sc, option))
                            }

                            return sc.setName(subcommand.name).setDescription(subcommand.description)
                        });
                    });
                }

                return commandData.toJSON();
            }),
        }
    );
}

type SlashCommandOption = {
    type: "ATTACHMENT" | "STRING" | "INTEGER" | "BOOLEAN" | "USER" | "CHANNEL" | "ROLE" | "MENTIONABLE" | "NUMBER",
    name: string,
    description: string,
    required?: boolean
}


function addOption(commandData: SlashCommandBuilder | SlashCommandSubcommandBuilder, option: SlashCommandOption) {
    switch (option.type) {
        case 'STRING': commandData.addStringOption(string => string.setName(option.name).setDescription(option.description).setRequired(option.required || false))
            break;
        case 'INTEGER': commandData.addIntegerOption(integer => integer.setName(option.name).setDescription(option.description).setRequired(option.required || false))
            break;
        case 'BOOLEAN': commandData.addBooleanOption(boolean => boolean.setName(option.name).setDescription(option.description).setRequired(option.required || false))
            break;
        case 'USER': commandData.addUserOption(user => user.setName(option.name).setDescription(option.description).setRequired(option.required || false))
            break;
        case 'CHANNEL': commandData.addChannelOption(channel => channel.setName(option.name).setDescription(option.description).setRequired(option.required || false))
            break;
        case 'ROLE': commandData.addRoleOption(role => role.setName(option.name).setDescription(option.description).setRequired(option.required || false))
            break;
        case 'MENTIONABLE': commandData.addMentionableOption(mentionable => mentionable.setName(option.name).setDescription(option.description).setRequired(option.required || false))
            break;
        case 'NUMBER': commandData.addNumberOption(number => number.setName(option.name).setDescription(option.description).setRequired(option.required || false))
            break;
        case 'ATTACHMENT': commandData.addAttachmentOption(attachment => attachment.setName(option.name).setDescription(option.description).setRequired(option.required || false))
            break;
    }
}

type Command = {
    name: string,
    description: string,
    options?: SlashCommandOption[]
    execute: (interaction: CommandInteraction) => void
    funcs?: { [name: string]: Function }
} | {
    name: string,
    description: string,
    subcommands: { [name: string]: Command }
    funcs?: { [name: string]: Function }
}

const commands: { [key: string]: Command } = {
    server: {
        name: 'server',
        description: 'Manage your servers',
        subcommands: {
            list: {
                name: 'list',
                description: 'List your servers',

                execute: async (interaction: CommandInteraction) => {
                    if (!("subcommands" in commands.server)) return;
                    setTimeout(() => "subcommands" in commands.server ? commands.server.subcommands.list.funcs?.setPage(interaction, 1) : null, 1000);
                    return commands.server.subcommands.list.funcs?.setPage(interaction, 1);
                },

                funcs: {
                    setPage: async (interaction: ButtonInteraction | CommandInteraction, page: number | string) => {
                        const userId = interaction.user.id;
                        const servers = serverListManager.getServerListByUser(userId).map((server) => serverListManager.getServer(server)).filter((server) => server !== undefined);

                        if (servers.length === 0) {
                            interaction.reply({ embeds: [embed('You have no servers')], ephemeral: true });
                            return;
                        }

                        if (typeof page === 'string') page = parseInt(page);
                        if (page < 1) page = 1;
                        if (page > Math.ceil(servers.length / 10)) page = Math.ceil(servers.length / 10);

                        let response = {} as InteractionUpdateOptions

                        const e = embed('Your servers');
                        servers.slice((page - 1) * 10, page * 10).map((server) => {
                            let statusEmoji = commands.server.funcs?.getServerStatusEmoji(server.id) as string;

                            e.addFields({ name: statusEmoji + " Address: " + server.ip + ":" + server.port, value: statusEmoji + " ID: " + server.id })
                        });
                        e.setFooter({ text: 'Page ' + page + ' of ' + Math.ceil(servers.length / 10) + " | " + e.data.footer?.text });

                        response.embeds = [e];

                        response.components = [
                            buttonRow(
                                button('Previous', ButtonStyle.Danger, 'server/list/setPage(' + (page - 1) + ')').setDisabled(page === 1),
                                button('Refresh', ButtonStyle.Secondary, 'server/list/setPage(' + page + ')'),
                                button('Next', ButtonStyle.Success, 'server/list/setPage(' + (page + 1) + ')').setDisabled(page === Math.ceil(servers.length / 10))
                            ),
                            select('Select server', 'server/list/select', servers.map((server) => { return { label: "IP: " + server.ip + " - ID: " + server.id, value: "" + server.id } }))
                        ];

                        if ("update" in interaction) return interaction.update(response as InteractionUpdateOptions);
                        else if (interaction.replied) return interaction.editReply(response as InteractionReplyOptions);
                        else interaction.reply({ ...response, ephemeral: true } as InteractionReplyOptions);

                    },
                    select: async (interaction: UserSelectMenuInteraction) => {
                        if (!("subcommands" in commands.server)) return;
                        return commands.server.subcommands.list.funcs?.openServerPage(interaction, interaction.values[0]);
                    },
                    openServerPage: async (interaction: CommandInteraction | UserSelectMenuInteraction | ButtonInteraction, serverId: string) => {
                        const usersServers = serverListManager.getServerListByUser(interaction.user.id);
                        if (!usersServers.includes(serverId)) return interaction.reply({ embeds: [embed('You do not own a server with this ID.')], ephemeral: true });

                        const server = serverListManager.getServer(serverId);
                        if (!server) return interaction.reply({ embeds: [embed('Server not found')], ephemeral: true });

                        const statusEmoji = commands.server.funcs?.getServerStatusEmoji(serverId) as string;

                        let whitelister = Whitelister.getWhitelister(server.id);

                        if (!whitelister) return interaction.reply({ embeds: [embed('Server not found')], ephemeral: true });

                        const lastSuccessfulConnection = whitelister.lastSuccessfulConnection;

                        const userData = serverListManager.getUserDataOfServer(serverId);

                        const response = {
                            embeds: [
                                embed('Server page')
                                    .setDescription('Server ID: ' + serverId)
                                    .addFields({ name: 'IP: ' + server.ip, value: "Rcon Port: " + server.port + "\nJoin Port: " + userData?.joinPort || "25565" })
                                    .addFields({ name: 'Status: ' + statusEmoji, value: "Last successful connection: " + (lastSuccessfulConnection ? (" <t:" + Math.floor(lastSuccessfulConnection / 1000) + ":R>") : "none") })
                                    .addFields({ name: 'Notes:', value: userData?.notes || "_No notes_" })
                            ],
                            components: [
                                buttonRow(
                                    button('Edit', ButtonStyle.Primary, 'server/editServer(' + serverId + ')'),
                                    button('Delete', ButtonStyle.Danger, 'server/remove/removeRequest(' + serverId + ')'),
                                    button('Refresh', ButtonStyle.Secondary, 'server/list/openServerPage(' + serverId + ')'),
                                ),
                                buttonRow(
                                    button('ServerList', ButtonStyle.Secondary, 'server/list/setPage(1)'),
                                    button('Whitelist', ButtonStyle.Primary, 'server/getWhitelist(' + serverId + ')'),
                                    button('Share', ButtonStyle.Success, 'server/share/shareServer(' + serverId + ')'),
                                )

                            ],
                            ephemeral: true
                        }

                        if (interaction.isButton() || interaction.isStringSelectMenu()) {
                            interaction.update(response)
                        } else {
                            interaction.reply(response)
                        }
                    }
                }
            },
            add: {
                name: 'add',
                description: 'Add a server to your servers',

                execute: async (interaction: CommandInteraction) => {
                    if (!("subcommands" in commands.server)) return;
                    commands.server.subcommands.add.funcs?.showModal(interaction);
                },
                funcs: {
                    showModal: async (interaction: CommandInteraction | ButtonInteraction, edit: string | undefined, ip = "", port = "", joinPort = "", notes = "") => {
                        interaction.showModal(
                            new ModalBuilder()
                                .setTitle((edit ? 'Edit' : 'Add') + ' a server')
                                .setCustomId(edit ? 'server/submitEdit(' + edit + ')' : 'server/add/submit')
                                .setComponents([
                                    new ActionRowBuilder<ModalActionRowComponentBuilder>()
                                        .setComponents(
                                            new TextInputBuilder()
                                                .setCustomId(edit ? 'server/edit/submitEdit/ip' : 'server/add/submit/ip')
                                                .setPlaceholder('Minecraft Server IP')
                                                .setLabel('IP')
                                                .setRequired(true)
                                                .setStyle(TextInputStyle.Short)
                                                .setValue(ip)
                                        ),
                                    new ActionRowBuilder<ModalActionRowComponentBuilder>()
                                        .setComponents(
                                            new TextInputBuilder()
                                                .setCustomId(edit ? 'server/edit/submitEdit/port' : 'server/add/submit/port')
                                                .setPlaceholder('Minecraft Server Rcon Port')
                                                .setLabel('RCON Port')
                                                .setRequired(true)
                                                .setStyle(TextInputStyle.Short)
                                                .setValue(port)
                                        ),
                                    new ActionRowBuilder<ModalActionRowComponentBuilder>()
                                        .setComponents(
                                            new TextInputBuilder()
                                                .setCustomId(edit ? 'server/edit/submitEdit/password' : 'server/add/submit/password')
                                                .setPlaceholder('Minecraft Server Rcon Password' + (edit ? " (Empty = keep old)" : ""))
                                                .setLabel('Password')
                                                .setRequired(edit ? false : true)
                                                .setStyle(TextInputStyle.Short)
                                        ),
                                    new ActionRowBuilder<ModalActionRowComponentBuilder>()
                                        .setComponents(
                                            new TextInputBuilder()
                                                .setCustomId(edit ? 'server/edit/submitEdit/joinport' : 'server/add/submit/joinport')
                                                .setPlaceholder('Minecraft Server Player Join Port (Default: 25565)')
                                                .setLabel('Join Port')
                                                .setRequired(true)
                                                .setStyle(TextInputStyle.Short)
                                                .setValue(joinPort || "25565")
                                        ),
                                    new ActionRowBuilder<ModalActionRowComponentBuilder>()
                                        .setComponents(
                                            new TextInputBuilder()
                                                .setCustomId(edit ? 'server/edit/submitEdit/notes' : 'server/add/submit/notes')
                                                .setPlaceholder('Notes')
                                                .setLabel('Notes')
                                                .setRequired(false)
                                                .setStyle(TextInputStyle.Paragraph)
                                                .setValue(notes)
                                        )
                                ])
                        );
                    },
                    submit: async (interaction: ModalSubmitInteraction) => {
                        const userId = interaction.user.id;

                        const ip = interaction.fields.fields.find((field) => field.customId === 'server/add/submit/ip')?.value;
                        const port = interaction.fields.fields.find((field) => field.customId === 'server/add/submit/port')?.value;
                        const password = interaction.fields.fields.find((field) => field.customId === 'server/add/submit/password')?.value;
                        const joinPort = interaction.fields.fields.find((field) => field.customId === 'server/add/submit/joinport')?.value || "25565";
                        const notes = interaction.fields.fields.find((field) => field.customId === 'server/add/submit/notes')?.value;

                        if (!ip || !port || !password) return interaction.reply({ embeds: [embed('Please fill out all fields')], ephemeral: true });

                        const e = embed("Verifying your server data...").addFields([{ name: "IP: " + ip, value: "RCON Port: " + port + "\nJoin Port: " + joinPort }, { name: "Notes", value: notes || "_No Notes_" }])

                        await interaction.reply({ embeds: [e], ephemeral: true });

                        const testWhitelister = new Whitelister({ id: 'test-C-' + userId, ip: ip, port: parseInt(port), password: password });
                        await testWhitelister.createConnection();
                        if (!testWhitelister.lastSuccessfulConnection) return interaction.editReply({
                            embeds: [e.setTitle("Could not connect to the server.")], components: [
                                buttonRow(
                                    button('Retry', ButtonStyle.Secondary, 'server/add/retry'),
                                )
                            ]
                        });
                        else {
                            testWhitelister.destroy();

                            const serverId = await serverListManager.createServer({ ip, port: parseInt(port), password }, { creator: userId, joinPort: parseInt(joinPort), notes: ((!notes || notes === "") ? null : notes) });

                            return interaction.editReply({
                                embeds: [e.setTitle("Server added successfully")], components: [
                                    buttonRow(
                                        button('ServerList', ButtonStyle.Success, 'server/list/setPage(1)'),
                                        button('ServerPage', ButtonStyle.Primary, 'server/list/openServerPage(' + serverId + ')'),
                                    )
                                ]
                            });
                        }
                    },
                    retry: async (interaction: ButtonInteraction) => {
                        const oldEmbed = interaction.message.embeds[0];

                        const ip = oldEmbed.fields[0].name.replace("IP: ", "");
                        const port = oldEmbed.fields[0].value.replace("RCON Port: ", "").split("\n")[0];
                        const joinPort = oldEmbed.fields[0].value.split("\n")[1].replace("Join Port: ", "");
                        const notes = oldEmbed.fields[1].value === "_No Notes_" ? undefined : oldEmbed.fields[1].value;

                        if (!("subcommands" in commands.server)) return
                        commands.server.subcommands.add.funcs?.showModal(interaction, undefined, ip, port, joinPort, notes);
                    }
                }
            },
            remove: {
                name: 'remove',
                description: 'Remove a server from your servers',

                options: [
                    {
                        type: 'STRING',
                        name: 'server',
                        description: 'The server ID',
                        required: true
                    }
                ],

                execute: async (interaction: CommandInteraction) => { 
                    const serverId = (interaction.options as CommandInteractionOptionResolver).getString('server') || '';
                    if (!("subcommands" in commands.server)) return;
                    commands.server.subcommands.remove.funcs?.removeRequest(interaction, serverId);
                },

                funcs: {
                    removeRequest: async (interaction: CommandInteraction | ButtonInteraction, serverId: string) => {
                        if (!serverListManager.getServerListByUser(interaction.user.id).includes(serverId)) return interaction.reply({ embeds: [embed('You do not own a server with this ID.')], ephemeral: true });

                        const server = serverListManager.getServer(serverId);
                        const serverUserData = serverListManager.getUserDataOfServer(serverId);
    
                        if (!server || !serverUserData) return interaction.reply({ embeds: [embed('Server not found')], ephemeral: true });
    
                        interaction.reply({ embeds: [embed('Are you sure you want to remove this server?')
                            .addFields({ name: 'Server ID', value: serverId }, { name: 'IP: ' + server.ip, value: 'RCON Port: ' + server.port + '\nJoin Port: ' + serverUserData.joinPort }, { name: 'Notes', value: serverUserData.notes || "_No notes_" })
                        ], components: [
                            buttonRow(
                                button('Yes', ButtonStyle.Success, 'server/remove/confirm(' + serverId + ')'), 
                                button('No', ButtonStyle.Danger, 'server/remove/cancel')
                            )
                        ], ephemeral: true });
                    },
                    confirm: async (interaction: ButtonInteraction, serverId: string) => {
                        await serverListManager.deleteServer(serverId);
                        interaction.update({ embeds: [embed('Server removed')], components: [] });
                    },
                    cancel: async (interaction: ButtonInteraction) => {
                        interaction.update({ embeds: [embed('Operation cancelled')], components: [] });
                    }
                }
            },
            share: {
                name: 'share',
                description: 'Share a server to enable all users in the channel to join',

                options: [
                    {
                        type: 'STRING',
                        name: 'server',
                        description: 'The server ID',
                        required: true
                    }
                ],

                execute: async (interaction: CommandInteraction) => {
                    const serverId = (interaction.options as CommandInteractionOptionResolver).getString('server') || '';
                    if (!("subcommands" in commands.server)) return;
                    commands.server.subcommands.share.funcs?.shareServer(interaction, serverId);
                },

                funcs: {
                    shareServer: async (interaction: CommandInteraction | ButtonInteraction, serverId: string) => {
                        const userServerList = serverListManager.getServerListByUser(interaction.user.id);
                        if (!userServerList.includes(serverId)) return interaction.reply({ embeds: [embed('You do not own a server with this ID.')], ephemeral: true });

                        const server = serverListManager.getServer(serverId);
                        if (!server) return interaction.reply({ embeds: [embed('Server not found')], ephemeral: true });

                        const serverUserData = serverListManager.getUserDataOfServer(serverId);
                        if (!serverUserData) return interaction.reply({ embeds: [embed('Server not found')], ephemeral: true });

                        const channel = interaction.channel;
                        if (!channel) return interaction.reply({ embeds: [embed('Channel not found')], ephemeral: true });

                        const response = {
                            embeds: [
                                embed('Join ' + interaction.user.displayName + "'s Minecraft Server!")
                                    .setDescription("<@795696750966210600> shared a server in this channel. Click the button below to add yourself to the whitelist!")
                                    .setFields({
                                        name: 'Server Address: ', value: '||' + server.ip + ':' + serverUserData.joinPort + '||'
                                    })
                            ],
                            components: [
                                buttonRow(
                                    button('Join Whitelist', ButtonStyle.Success, 'server/whitelist(' + serverId + ',' + interaction.channelId + ')')
                                )
                            ]
                        }
                        interaction.reply(response);
                    }
                }
            },
        },
        funcs: {
            getServerStatusEmoji: (serverId: string, disableServerInteraction: boolean = false) => {
                const server = serverListManager.getServer(serverId)
                const whitelister = Whitelister.getWhitelister(serverId)

                type Status = "online" | "unknown" | "unreachable";
                let status: Status = "unknown";

                if (whitelister) {
                    if (Date.now() - (whitelister.lastSuccessfulConnection || 0) < 60000) status = "online";
                    if (whitelister.log[whitelister.log.length - 1].type === "error") status = "unreachable";

                    if (status === "unknown" && !disableServerInteraction) whitelister.createConnection();
                    if (status === "unreachable" && !disableServerInteraction && Date.now() - whitelister.log.filter((logM) => logM.type === "error").slice(-1)[0]?.date > 20000) whitelister.createConnection();

                } else if ((server)) {
                    if (disableServerInteraction) status = "unknown"
                    else new Whitelister(server).createConnection();
                }

                const statusEmojis: Record<Status, string> = {
                    online: ":green_circle:",
                    unknown: ":yellow_square:",
                    unreachable: ":x:"
                } as const

                return statusEmojis[status];
            },
            editServer: async (interaction: CommandInteraction, serverId: string) => {
                const user = interaction.user.id;
                const usersServers = serverListManager.getServerListByUser(user);
                if (!usersServers.includes(serverId)) return interaction.reply({ embeds: [embed('You do not own a server with this ID.')], ephemeral: true });

                const server = serverListManager.getServer(serverId);
                if (!server) return interaction.reply({ embeds: [embed('Server not found')], ephemeral: true });

                const userData = serverListManager.getUserDataOfServer(serverId)
                if (!userData) return interaction.reply({ embeds: [embed('Server not found')], ephemeral: true });

                if (!("subcommands" in commands.server)) return;
                commands.server.subcommands.add.funcs?.showModal(interaction, server.id, server.ip, server.port.toString(), "" + userData.joinPort, userData.notes || "");
            },
            submitEdit: async (interaction: ModalSubmitInteraction, serverId: string) => {
                const user = interaction.user.id;
                const usersServers = serverListManager.getServerListByUser(user);
                if (!usersServers.includes(serverId)) return interaction.reply({ embeds: [embed('You do not own a server with this ID.')], ephemeral: true });

                const server = serverListManager.getServer(serverId);
                if (!server) return interaction.reply({ embeds: [embed('Server not found')], ephemeral: true });

                const ip = interaction.fields.fields.find((field) => field.customId === 'server/edit/submitEdit/ip')?.value;
                const port = interaction.fields.fields.find((field) => field.customId === 'server/edit/submitEdit/port')?.value;
                const password = interaction.fields.fields.find((field) => field.customId === 'server/edit/submitEdit/password')?.value || server.password;
                const joinPort = interaction.fields.fields.find((field) => field.customId === 'server/edit/submitEdit/joinport')?.value  || "25565";
                const notes = interaction.fields.fields.find((field) => field.customId === 'server/edit/submitEdit/notes')?.value;

                if (!ip || !port || !password) return interaction.reply({ embeds: [embed('Please fill out all fields')], ephemeral: true });

                const e = embed("Verifying your server data...").addFields([{ name: "IP: " + ip, value: "RCON Port: " + port + "\nJoin Port: " + joinPort }, { name: "Notes", value: notes || "_No Notes_" }])

                await interaction.reply({ embeds: [e], ephemeral: true });

                const testWhitelister = new Whitelister({ id: 'test-E-' + user, ip: ip, port: parseInt(port), password: password });
                await testWhitelister.createConnection();
                if (!testWhitelister.lastSuccessfulConnection) return interaction.editReply({
                    embeds: [e.setTitle("Could not connect to the server.")], components: [
                        buttonRow(
                            button('Retry', ButtonStyle.Secondary, 'server/editServer(' + serverId + ')'),
                        )
                    ]
                });
                else {
                    testWhitelister.destroy();

                    serverListManager.editServer(serverId, { ip, port: parseInt(port), password }, { joinPort: parseInt(joinPort), notes: ((!notes || notes === "") ? null : notes) });

                    return interaction.editReply({
                        embeds: [e.setTitle("Server edited successfully")], components: [
                            buttonRow(
                                button('ServerList', ButtonStyle.Success, 'server/list/setPage(1)'),
                                button('ServerPage', ButtonStyle.Primary, 'server/list/openServerPage(' + serverId + ')'),
                            )
                        ]
                    });
                }
            },
            whitelist: async (interaction: ButtonInteraction, serverId: string, channelId: string, remove: string = "false") => {
                const user = interaction.user.id;
                const chId = interaction.channelId;

                if (chId !== channelId) return interaction.reply({ embeds: [embed('You can only ' + (remove === "true" ? 'leave' : 'join') + ' the whitelist in the channel where the server was shared')], ephemeral: true });
                
                const minecraftUsername = discordMinecraftLinks[user];

                if (!minecraftUsername) return interaction.reply({ embeds: [embed('Use /link to link your Discord Account to your Minecraft Account first!')], ephemeral: true });

                const server = serverListManager.getServer(serverId);
                if (!server) return interaction.reply({ embeds: [embed('Server not found')], ephemeral: true });

                const whitelister = Whitelister.getWhitelister(serverId) || new Whitelister(server);

                await whitelister.createTimedConnection(1000);

                if(Date.now() - (whitelister.lastSuccessfulConnection || 0) > 1000) return interaction.reply({ embeds: [embed('Could not connect to the server. (e.g. server offline)')], ephemeral: true });
            
                const success = remove === "true" ? await whitelister.unwhitelistPlayer(minecraftUsername) : await whitelister.whitelistPlayer(minecraftUsername);

                const response = { embeds: [
                    success === 1 ? embed('You have been ' + (remove === "true" ? 'removed from' : 'added to') + ' the whitelist') :
                    embed('You are already ' + (remove === "true" ? 'not on' : 'on') + ' the whitelist')
                ], ephemeral: true, components: remove !== "true" ? [ 
                    buttonRow(button('Remove from whitelist', ButtonStyle.Danger, 'server/whitelist(' + serverId + ',' + channelId + ',true)')) 
                ] : [] }
                
                if (success > -1) return interaction.reply(response);
                else return interaction.reply({ embeds: [embed('Could not ' + (remove === "true" ? 'remove you from' : 'add you to') + ' the whitelist. Try again later.')], ephemeral: true });
            },
            getWhitelist: async (interaction: CommandInteraction, serverId: string) => {
                const user = interaction.user.id;
                const usersServers = serverListManager.getServerListByUser(user);
                if (!usersServers.includes(serverId)) return interaction.reply({ embeds: [embed('You do not own a server with this ID.')], ephemeral: true });

                const server = serverListManager.getServer(serverId);
                if (!server) return interaction.reply({ embeds: [embed('Server not found')], ephemeral: true });

                const whitelister = Whitelister.getWhitelister(serverId) || new Whitelister(server);

                await whitelister.createTimedConnection(1000);

                if(Date.now() - (whitelister.lastSuccessfulConnection || 0) > 1000) return interaction.reply({ embeds: [embed('Could not connect to the server. (e.g. server offline)')], ephemeral: true });

                const whitelist = await whitelister.getWhitelistedPlayers();

                const e = embed('Whitelist of ' + server.ip + ':' + server.port).setDescription(whitelist.join("\n"));

                interaction.reply({ embeds: [e], ephemeral: true });
            }
        }
    },
    link: {
        name: 'link',
        description: 'Link your Minecraft account to your Discord account',

        options: [{
            type: 'STRING',
            name: 'name',
            description: 'Your Minecraft username',
            required: true,
        }],

        execute: async (interaction: CommandInteraction) => {
            const userId = interaction.user.id;
            const newMinecraftName = (interaction.options as CommandInteractionOptionResolver).getString('name') || '';

            if(Object.values(discordMinecraftLinks).includes(newMinecraftName)) return interaction.reply({ embeds: [embed('This Minecraft account is already linked to a Discord account')], ephemeral: true });

            if (userId in discordMinecraftLinks) {
                interaction.reply({ embeds: [embed('You are already linked, change name to "' + newMinecraftName + '"?').setThumbnail('https://mineskin.eu/armor/bust/' + newMinecraftName + '/100.png')], components: [buttonRow(button('Change name', ButtonStyle.Success, 'link/changeName(' + userId + ')'))] });
                return;
            } else {
                commands.link.funcs?.setName(userId, newMinecraftName);

                interaction.reply({ embeds: [embed('Linked "' + newMinecraftName + '"').setThumbnail('https://mineskin.eu/armor/bust/' + newMinecraftName + '/100.png')] });
            }
        },

        funcs: {
            changeName: async (interaction: ButtonInteraction, oldRequestUserId: string) => {
                const userId = interaction.user.id;

                if (userId !== oldRequestUserId) return interaction.reply({ embeds: [embed('You are not the user who requested this action')], ephemeral: true });
                const newMinecraftName = interaction.message.embeds[0].title?.split('"').slice(1).slice(0, -1).join('"') || '';
                
                if(Object.values(discordMinecraftLinks).includes(newMinecraftName)) return interaction.update({ embeds: [embed('This Minecraft account is already linked to a Discord account')] });

                const oldName = discordMinecraftLinks[userId];

                commands.link.funcs?.setName(userId, newMinecraftName);

                interaction.update({ components: [], embeds: [embed('Name changed from "' + oldName + '" to "' + newMinecraftName + '"').setThumbnail('https://mineskin.eu/armor/bust/' + newMinecraftName + '/100.png')] });
            },
            setName: async (userId: string, mcName: string) => {
                discordMinecraftLinks[userId] = mcName;
                fs.writeFileSync('./data/discordAccounts.json', JSON.stringify(discordMinecraftLinks));
            }
        }
    }
} as const