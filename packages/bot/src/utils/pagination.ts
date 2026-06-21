import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

const PAGE_SIZE = 5;
const TIMEOUT_MS = 5 * 60 * 1000;

export async function sendPaginated(
  interaction: ChatInputCommandInteraction,
  allEmbeds: EmbedBuilder[],
): Promise<void> {
  if (allEmbeds.length <= PAGE_SIZE) {
    await interaction.editReply({ embeds: allEmbeds });
    return;
  }

  let page = 0;
  const totalPages = Math.ceil(allEmbeds.length / PAGE_SIZE);

  const getPage = () => allEmbeds.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const getButtons = () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("page_prev")
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("page_info")
        .setLabel(`${page + 1} / ${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("page_next")
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    );

  const message = await interaction.editReply({
    embeds: getPage(),
    components: [getButtons()],
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === interaction.user.id,
    time: TIMEOUT_MS,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "page_next" && page < totalPages - 1) page++;
    else if (i.customId === "page_prev" && page > 0) page--;

    await i.update({ embeds: getPage(), components: [getButtons()] });
  });

  collector.on("end", async () => {
    try {
      await interaction.editReply({ embeds: getPage(), components: [] });
    } catch {}
  });
}
