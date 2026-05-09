import { sendBotMessage, ApplicationCommandInputType } from "@api/Commands";
import definePlugin from "@utils/types";
import { ChannelStore, GuildStore, RestAPI, UserStore } from "@webpack/common";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function wipeChannel(channelId: string, remaining: number): Promise<number> {
    let count = 0;
    let before: string | undefined;
    const userId = UserStore.getCurrentUser().id;

    outer:
    while (count < remaining) {
        let messages: any[];
        try {
            const res = await RestAPI.get({
                url: `/channels/${channelId}/messages`,
                query: { limit: 100, ...(before ? { before } : {}) },
            });
            messages = res.body ?? [];
        } catch {
            break;
        }

        if (!messages.length) break;

        for (const msg of messages) {
            if (count >= remaining) break outer;

            if (msg.author?.id === userId) {
                try {
                    await RestAPI.del({ url: `/channels/${channelId}/messages/${msg.id}` });
                    count++;
                    await sleep(800);
                } catch (e: any) {
                    if (e?.status === 429) {
                        await sleep((e.body?.retry_after ?? 1) * 1000 + 200);
                        try {
                            await RestAPI.del({ url: `/channels/${channelId}/messages/${msg.id}` });
                            count++;
                            await sleep(800);
                        } catch {}
                    }
                }
            }

            before = msg.id;
        }

        if (messages.length < 100) break;
    }

    return count;
}

export default definePlugin({
    name: "Message wiper",
    description: "bye bye msgs",
    authors: [{ id: "832999544844845056", name: "Fae" }],

    commands: [{
        name: "wipe",
        description: "Delete messages anywhere",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "amount",
                description: "How many of your messages to delete",
                type: 4,
                required: true,
                minValue: 1,
                maxValue: 1000,
            },
            {
                name: "scope",
                description: "Where to delete messages (default: channel)",
                type: 3,
                required: false,
                choices: [
                    { name: "This channel only", value: "channel" },
                    { name: "Whole server (all channels)", value: "server" },
                ],
            },
        ],

        execute: async (args, ctx) => {
            const amount: number = args.find(a => a.name === "amount")?.value ?? 0;
            const scope: string = args.find(a => a.name === "scope")?.value ?? "channel";

            if (!amount || amount <= 0) {
                sendBotMessage(ctx.channel.id, { content: "Invalid amount." });
                return;
            }

            let deletedCount = 0;

            if (scope === "server") {
                const guild = GuildStore.getGuild(ctx.channel.guild_id);
                if (!guild) {
                    sendBotMessage(ctx.channel.id, { content: "Not in a server." });
                    return;
                }

                const channels = Object.values(ChannelStore.getMutableGuildChannelsForGuild(guild.id) ?? {})
                    .filter((c: any) => c.type === 0 || c.type === 5);

                for (const channel of channels as any[]) {
                    if (deletedCount >= amount) break;
                    deletedCount += await wipeChannel(channel.id, amount - deletedCount);
                }
            } else {
                deletedCount = await wipeChannel(ctx.channel.id, amount);
            }

            sendBotMessage(ctx.channel.id, { content: `Deleted ${deletedCount} messages.` });
        },
    }],
});
