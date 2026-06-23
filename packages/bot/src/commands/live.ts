import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { eq, asc } from "drizzle-orm";
import { matches } from "@gametime/db";
import { buildMatchEmbed } from "../utils/embeds";

const UPDATE_INTERVAL_MS = 30_000;
const MAX_DURATION_MS = 2 * 60 * 60 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName("live")
    .setDescription("Show currently live matches (auto-updating scores)") as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const { db } = interaction.client;

    const liveMatches = await fetchLiveMatches(db);

    if (liveMatches.length === 0) {
      await interaction.editReply("No matches are live right now.");
      return;
    }

    const stopButton = new ButtonBuilder()
      .setCustomId("live_stop")
      .setLabel("Stop Updates")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton);

    const embeds = liveMatches.slice(0, 9).map(buildMatchEmbed);
    const footer = buildFooterEmbed(liveMatches.length);

    const message = await interaction.editReply({
      embeds: [...embeds, footer],
      components: [row],
    });

    const startTime = Date.now();
    let stopped = false;

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "live_stop") {
        stopped = true;
        clearInterval(interval);
        collector.stop();
        await i.update({
          embeds: [...embeds, buildStoppedEmbed()],
          components: [],
        });
      }
    });

    const interval = setInterval(async () => {
      if (stopped || Date.now() - startTime > MAX_DURATION_MS) {
        clearInterval(interval);
        collector.stop();
        try {
          await interaction.editReply({
            embeds: [...embeds, buildExpiredEmbed()],
            components: [],
          });
        } catch {}
        return;
      }

      try {
        const updated = await fetchLiveMatches(db);

        if (updated.length === 0) {
          clearInterval(interval);
          collector.stop();
          await interaction.editReply({
            embeds: [buildNoMoreLiveEmbed()],
            components: [],
          });
          return;
        }

        const updatedEmbeds = updated.slice(0, 9).map(buildMatchEmbed);
        const updatedFooter = buildFooterEmbed(updated.length);
        await interaction.editReply({
          embeds: [...updatedEmbeds, updatedFooter],
          components: [row],
        });
      } catch {}
    }, UPDATE_INTERVAL_MS);
  },
};

async function fetchLiveMatches(db: any) {
  return db
    .select()
    .from(matches)
    .where(eq(matches.status, "live"))
    .orderBy(asc(matches.game));
}

function buildFooterEmbed(count: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setFooter({ text: `${count} live match${count !== 1 ? "es" : ""} · Auto-updating every 30s` })
    .setTimestamp();
}

function buildStoppedEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setFooter({ text: "Live updates stopped" })
    .setTimestamp();
}

function buildExpiredEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setFooter({ text: "Live updates expired after 2 hours" })
    .setTimestamp();
}

function buildNoMoreLiveEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setDescription("All live matches have ended.")
    .setTimestamp();
}
