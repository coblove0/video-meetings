export class UploadMeetingFileCommand {
  constructor(
    public readonly meetingId: string,
    public readonly ownerId: string,
    public readonly file: Express.Multer.File,
  ) {}
}
