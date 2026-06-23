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
const PAGE_SIZE = 5;

export default {
  data: new SlashCommandBuilder()
    .setName("live")
    .setDescription("Show currently live matches (auto-updating scores)") as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const { db } = interaction.client;

    let allLive = await fetchLiveMatches(db);

    if (allLive.length === 0) {
      await interaction.editReply("No matches are live right now.");
      return;
    }

    let page = 0;
    const startTime = Date.now();
    let stopped = false;

    function getPage(data: typeof allLive) {
      const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
      if (page >= totalPages) page = totalPages - 1;
      const slice = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      return { slice, totalPages };
    }

    function buildComponents(totalPages: number) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("live_prev")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("live_page")
          .setLabel(`${page + 1} / ${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("live_next")
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1),
        new ButtonBuilder()
          .setCustomId("live_stop")
          .setLabel("Stop")
          .setStyle(ButtonStyle.Danger),
      );
      return [row];
    }

    function buildMessage(data: typeof allLive) {
      const { slice, totalPages } = getPage(data);
      const embeds = slice.map(buildMatchEmbed);
      const footer = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setFooter({
          text: `${data.length} live match${data.length !== 1 ? "es" : ""} · Page ${page + 1}/${totalPages} · Auto-updating every 30s`,
        })
        .setTimestamp();
      return { embeds: [...embeds, footer], components: buildComponents(totalPages) };
    }

    const message = await interaction.editReply(buildMessage(allLive));

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: MAX_DURATION_MS,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "live_stop") {
        stopped = true;
        clearInterval(interval);
        collector.stop();
        const { slice } = getPage(allLive);
        const embeds = slice.map(buildMatchEmbed);
        const footer = new EmbedBuilder()
          .setColor(0x95a5a6)
          .setFooter({ text: "Live updates stopped" })
          .setTimestamp();
        await i.update({ embeds: [...embeds, footer], components: [] });
        return;
      }

      if (i.customId === "live_next") page++;
      if (i.customId === "live_prev") page--;

      await i.update(buildMessage(allLive));
    });

    const interval = setInterval(async () => {
      if (stopped || Date.now() - startTime > MAX_DURATION_MS) {
        clearInterval(interval);
        collector.stop();
        try {
          const { slice } = getPage(allLive);
          const embeds = slice.map(buildMatchEmbed);
          const footer = new EmbedBuilder()
            .setColor(0x95a5a6)
            .setFooter({ text: "Live updates expired after 2 hours" })
            .setTimestamp();
          await interaction.editReply({ embeds: [...embeds, footer], components: [] });
        } catch {}
        return;
      }

      try {
        const updated = await fetchLiveMatches(db);

        if (updated.length === 0) {
          clearInterval(interval);
          collector.stop();
          const footer = new EmbedBuilder()
            .setColor(0x95a5a6)
            .setDescription("All live matches have ended.")
            .setTimestamp();
          await interaction.editReply({ embeds: [footer], components: [] });
          return;
        }

        allLive = updated;
        await interaction.editReply(buildMessage(allLive));
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
