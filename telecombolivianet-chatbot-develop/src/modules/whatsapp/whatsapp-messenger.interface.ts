export const WHATSAPP_MESSENGER = Symbol('WHATSAPP_MESSENGER');

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: Array<{ type: 'text' | 'image' | 'document'; text?: string }>;
  index?: number;
  sub_type?: string;
}

export interface IWhatsappMessenger {
  sendText(to: string, text: string): Promise<string>;
  sendImage(to: string, imageUrl: string, caption?: string): Promise<string>;
  sendList(
    to: string,
    body: string,
    buttonLabel: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
  ): Promise<string>;
  sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<string>;
  sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[],
  ): Promise<string>;
  /** Marca leído; con typing=true además muestra el indicador "escribiendo…" (Cloud API v21+). */
  markAsRead(messageId: string, typing?: boolean): Promise<void>;
  downloadMedia(mediaId: string): Promise<Buffer>;
}
