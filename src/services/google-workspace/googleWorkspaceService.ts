/**
 * Google Workspace Service - Google Workspace Integration Gateway
 * Full access to Google Drive, Gmail, Calendar, Docs, Sheets, etc.
 */

import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { drive_v3, gmail_v1, calendar_v3, docs_v1, sheets_v4 } from 'googleapis';

export interface GoogleWorkspaceConfig {
  projectId?: string;
  serviceAccountKey?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
  scopes?: string[];
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: Date;
  modifiedTime: Date;
  owners: Array<{
    displayName: string;
    emailAddress: string;
  }>;
  webViewLink?: string;
  downloadUrl?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  payload: {
    headers: Array<{
      name: string;
      value: string;
    }>;
    body?: {
      data?: string;
    };
  };
  sizeEstimate: number;
  internalDate: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
  }>;
  status: string;
  created: Date;
  updated: Date;
}

export class GoogleWorkspaceService {
  private config: GoogleWorkspaceConfig;
  private auth: GoogleAuth;
  private drive?: drive_v3.Drive;
  private gmail?: gmail_v1.Gmail;
  private calendar?: calendar_v3.Calendar;
  private docs?: docs_v1.Docs;
  private sheets?: sheets_v4.Sheets;

  constructor(config: GoogleWorkspaceConfig = {}) {
    this.config = {
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/spreadsheets'
      ],
      ...config
    };

    this.auth = new GoogleAuth({
      credentials: config.credentials || config.serviceAccountKey,
      scopes: this.config.scopes
    });

    this.initializeClients();
  }

  private async initializeClients(): Promise<void> {
    try {
      const authClient = await this.auth.getClient();

      this.drive = google.drive({ version: 'v3', auth: authClient });
      this.gmail = google.gmail({ version: 'v1', auth: authClient });
      this.calendar = google.calendar({ version: 'v3', auth: authClient });
      this.docs = google.docs({ version: 'v1', auth: authClient });
      this.sheets = google.sheets({ version: 'v4', auth: authClient });

      console.log('✅ Google Workspace clients initialized');
    } catch (error) {
      console.error('Failed to initialize Google Workspace clients:', error);
    }
  }

  // Google Drive Operations
  public async listFiles(options: {
    query?: string;
    pageSize?: number;
    orderBy?: string;
    fields?: string;
  } = {}): Promise<GoogleDriveFile[]> {
    if (!this.drive) throw new Error('Drive client not initialized');

    try {
      const response = await this.drive.files.list({
        q: options.query,
        pageSize: options.pageSize || 100,
        orderBy: options.orderBy || 'modifiedTime desc',
        fields: options.fields || 'files(id,name,mimeType,size,createdTime,modifiedTime,owners,webViewLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      return response.data.files?.map(file => this.transformDriveFile(file)) || [];
    } catch (error) {
      console.error('Failed to list Drive files:', error);
      return [];
    }
  }

  public async getFile(fileId: string): Promise<GoogleDriveFile | null> {
    if (!this.drive) throw new Error('Drive client not initialized');

    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id,name,mimeType,size,createdTime,modifiedTime,owners,webViewLink'
      });

      return this.transformDriveFile(response.data);
    } catch (error) {
      console.error('Failed to get Drive file:', error);
      return null;
    }
  }

  public async downloadFile(fileId: string): Promise<Buffer | null> {
    if (!this.drive) throw new Error('Drive client not initialized');

    try {
      const response = await this.drive.files.get({
        fileId,
        alt: 'media'
      }, { responseType: 'arraybuffer' });

      return Buffer.from(response.data as ArrayBuffer);
    } catch (error) {
      console.error('Failed to download file:', error);
      return null;
    }
  }

  public async uploadFile(options: {
    name: string;
    mimeType: string;
    content: Buffer;
    parentId?: string;
  }): Promise<GoogleDriveFile | null> {
    if (!this.drive) throw new Error('Drive client not initialized');

    try {
      const fileMetadata: any = {
        name: options.name,
        mimeType: options.mimeType
      };

      if (options.parentId) {
        fileMetadata.parents = [options.parentId];
      }

      const media = {
        mimeType: options.mimeType,
        body: options.content
      };

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id,name,mimeType,size,createdTime,modifiedTime,owners,webViewLink'
      });

      return this.transformDriveFile(response.data);
    } catch (error) {
      console.error('Failed to upload file:', error);
      throw error;
    }
  }

  public async createFolder(name: string, parentId?: string): Promise<GoogleDriveFile | null> {
    if (!this.drive) throw new Error('Drive client not initialized');

    try {
      const fileMetadata: any = {
        name,
        mimeType: 'application/vnd.google-apps.folder'
      };

      if (parentId) {
        fileMetadata.parents = [parentId];
      }

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: 'id,name,mimeType,createdTime,modifiedTime,owners,webViewLink'
      });

      return this.transformDriveFile(response.data);
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }

  // Gmail Operations
  public async listMessages(options: {
    q?: string;
    maxResults?: number;
    labelIds?: string[];
  } = {}): Promise<GmailMessage[]> {
    if (!this.gmail) throw new Error('Gmail client not initialized');

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: options.q,
        maxResults: options.maxResults || 50,
        labelIds: options.labelIds
      });

      if (!response.data.messages) return [];

      const messages = await Promise.all(
        response.data.messages.map(async (msg) => {
          const fullMessage = await this.gmail!.users.messages.get({
            userId: 'me',
            id: msg.id!
          });
          return this.transformGmailMessage(fullMessage.data);
        })
      );

      return messages;
    } catch (error) {
      console.error('Failed to list Gmail messages:', error);
      return [];
    }
  }

  public async getMessage(messageId: string): Promise<GmailMessage | null> {
    if (!this.gmail) throw new Error('Gmail client not initialized');

    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId
      });

      return this.transformGmailMessage(response.data);
    } catch (error) {
      console.error('Failed to get Gmail message:', error);
      return null;
    }
  }

  public async sendEmail(options: {
    to: string | string[];
    subject: string;
    body: string;
    cc?: string | string[];
    bcc?: string | string[];
  }): Promise<any> {
    if (!this.gmail) throw new Error('Gmail client not initialized');

    try {
      const to = Array.isArray(options.to) ? options.to.join(',') : options.to;
      const cc = options.cc ? (Array.isArray(options.cc) ? options.cc.join(',') : options.cc) : undefined;
      const bcc = options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(',') : options.bcc) : undefined;

      const email = [
        `To: ${to}`,
        `Subject: ${options.subject}`,
        cc ? `Cc: ${cc}` : '',
        bcc ? `Bcc: ${bcc}` : '',
        '',
        options.body
      ].filter(line => line).join('\r\n');

      const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      });

      return response.data;
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  // Google Calendar Operations
  public async listEvents(options: {
    calendarId?: string;
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
    q?: string;
  } = {}): Promise<CalendarEvent[]> {
    if (!this.calendar) throw new Error('Calendar client not initialized');

    try {
      const calendarId = options.calendarId || 'primary';
      const response = await this.calendar.events.list({
        calendarId,
        timeMin: options.timeMin?.toISOString(),
        timeMax: options.timeMax?.toISOString(),
        maxResults: options.maxResults || 50,
        q: options.q,
        singleEvents: true,
        orderBy: 'startTime'
      });

      return response.data.items?.map(event => this.transformCalendarEvent(event)) || [];
    } catch (error) {
      console.error('Failed to list calendar events:', error);
      return [];
    }
  }

  public async createEvent(options: {
    calendarId?: string;
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    attendees?: string[];
    location?: string;
  }): Promise<CalendarEvent | null> {
    if (!this.calendar) throw new Error('Calendar client not initialized');

    try {
      const calendarId = options.calendarId || 'primary';
      const event = {
        summary: options.summary,
        description: options.description,
        start: {
          dateTime: options.start.toISOString()
        },
        end: {
          dateTime: options.end.toISOString()
        },
        attendees: options.attendees?.map(email => ({ email })),
        location: options.location
      };

      const response = await this.calendar.events.insert({
        calendarId,
        requestBody: event
      });

      return this.transformCalendarEvent(response.data);
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      throw error;
    }
  }

  // Google Docs Operations
  public async createDocument(title: string): Promise<any> {
    if (!this.docs) throw new Error('Docs client not initialized');

    try {
      const response = await this.docs.documents.create({
        requestBody: {
          title
        }
      });

      return response.data;
    } catch (error) {
      console.error('Failed to create document:', error);
      throw error;
    }
  }

  public async getDocument(documentId: string): Promise<any> {
    if (!this.docs) throw new Error('Docs client not initialized');

    try {
      const response = await this.docs.documents.get({
        documentId
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get document:', error);
      return null;
    }
  }

  // Google Sheets Operations
  public async createSpreadsheet(title: string): Promise<any> {
    if (!this.sheets) throw new Error('Sheets client not initialized');

    try {
      const response = await this.sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title
          }
        }
      });

      return response.data;
    } catch (error) {
      console.error('Failed to create spreadsheet:', error);
      throw error;
    }
  }

  public async getSpreadsheet(spreadsheetId: string): Promise<any> {
    if (!this.sheets) throw new Error('Sheets client not initialized');

    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get spreadsheet:', error);
      return null;
    }
  }

  public async readSheetRange(spreadsheetId: string, range: string): Promise<any[][]> {
    if (!this.sheets) throw new Error('Sheets client not initialized');

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });

      return response.data.values || [];
    } catch (error) {
      console.error('Failed to read sheet range:', error);
      return [];
    }
  }

  public async writeSheetRange(spreadsheetId: string, range: string, values: any[][]): Promise<any> {
    if (!this.sheets) throw new Error('Sheets client not initialized');

    try {
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values
        }
      });

      return response.data;
    } catch (error) {
      console.error('Failed to write sheet range:', error);
      throw error;
    }
  }

  // Utility Methods
  private transformDriveFile(file: any): GoogleDriveFile {
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      createdTime: new Date(file.createdTime),
      modifiedTime: new Date(file.modifiedTime),
      owners: file.owners?.map((owner: any) => ({
        displayName: owner.displayName,
        emailAddress: owner.emailAddress
      })) || [],
      webViewLink: file.webViewLink,
      downloadUrl: file.downloadUrl
    };
  }

  private transformGmailMessage(message: any): GmailMessage {
    return {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds,
      snippet: message.snippet,
      payload: message.payload,
      sizeEstimate: message.sizeEstimate,
      internalDate: message.internalDate
    };
  }

  private transformCalendarEvent(event: any): CalendarEvent {
    return {
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      attendees: event.attendees,
      status: event.status,
      created: new Date(event.created),
      updated: new Date(event.updated)
    };
  }

  // Health Check
  public async healthCheck(): Promise<boolean> {
    try {
      // Test Drive access
      if (this.drive) {
        await this.drive.files.list({ pageSize: 1 });
      }

      // Test Gmail access
      if (this.gmail) {
        await this.gmail.users.getProfile({ userId: 'me' });
      }

      return true;
    } catch (error) {
      console.error('Google Workspace health check failed:', error);
      return false;
    }
  }

  // Advanced Operations
  public async searchFiles(query: string): Promise<GoogleDriveFile[]> {
    return await this.listFiles({ query: `name contains '${query}'` });
  }

  public async shareFile(fileId: string, email: string, role: 'reader' | 'writer' | 'owner' = 'reader'): Promise<boolean> {
    if (!this.drive) throw new Error('Drive client not initialized');

    try {
      await this.drive.permissions.create({
        fileId,
        requestBody: {
          type: 'user',
          role,
          emailAddress: email
        }
      });
      return true;
    } catch (error) {
      console.error('Failed to share file:', error);
      return false;
    }
  }

  public async createCalendar(calendarName: string): Promise<any> {
    if (!this.calendar) throw new Error('Calendar client not initialized');

    try {
      const response = await this.calendar.calendars.insert({
        requestBody: {
          summary: calendarName
        }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to create calendar:', error);
      throw error;
    }
  }
}