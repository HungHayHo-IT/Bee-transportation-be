import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, Res,
} from '@nestjs/common';
import {
  ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags,
} from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { clamp, MAX_PAGE, onePage, PageResult } from '@/common/dto/pagination.dto';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { COMMENT_PAGE_SIZE, CommentsService } from './comments.service';
import {
  CommentDto, CommentPageDto, CreateCommentDto, FileMetaDto, FileMetaPageDto, MentionableUserDto,
  MentionablePageDto,
} from './dto/comment.dto';
import { FilesService } from './files.service';

/** Fastify multipart — request có hàm file() khi bật @fastify/multipart. */
type MultipartRequest = FastifyRequest & {
  isMultipart(): boolean;
  file(): Promise<
    | { filename: string; mimetype: string; toBuffer(): Promise<Buffer> }
    | undefined
  >;
};

@ApiTags('Collab (F3/F5)')
@Controller()
export class CollabController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly filesService: FilesService,
  ) {}

  @Get('orders/:id/comments')
  @ApiOperation({ summary: 'Bình luận — đã lọc theo luồng người gọi được xem' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Mặc định 1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiResponse({ status: 200, type: CommentPageDto })
  listComments(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PageResult<CommentDto>> {
    return this.commentsService.list(
      id, user, clamp(page, 1, 1, MAX_PAGE), clamp(limit, COMMENT_PAGE_SIZE, 1, 100),
    );
  }

  @Post('orders/:id/comments')
  @ApiOperation({
    summary: 'Viết bình luận, kèm @mention',
    description: 'Trả về TRANG CUỐI của luồng — nơi chứa bình luận vừa viết.',
  })
  @ApiResponse({ status: 201, type: CommentPageDto })
  createComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<CommentDto>> {
    return this.commentsService.create(id, dto, user);
  }

  @Get('orders/:id/mentionables')
  @ApiOperation({ summary: 'Ai có thể @mention trong luồng của người gọi' })
  @ApiQuery({ name: 'departmentId', required: false, type: Number })
  @ApiResponse({ status: 200, type: MentionablePageDto })
  async listMentionables(
    @Param('id', ParseIntPipe) id: number,
    @Query('departmentId') departmentId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<MentionableUserDto>> {
    return onePage(
      await this.commentsService.mentionables(
        id,
        departmentId === undefined ? undefined : Number(departmentId),
        user,
      ),
    );
  }

  @Get('orders/:id/files')
  @ApiOperation({ summary: 'Danh sách file của đơn (gồm file theo mốc)' })
  @ApiResponse({ status: 200, type: FileMetaPageDto })
  async listFiles(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<FileMetaDto>> {
    return onePage(await this.filesService.list(id, user));
  }

  // QA-08: Swagger không có requestBody nên "Try it out" không hiện ô chọn file và
  // sinh code client cũng không biết tên trường. Khai báo tường minh.
  @Post('orders/:id/files')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải file lên — pdf/ảnh/doc/xls, tối đa 20MB' })
  @ApiQuery({
    name: 'milestoneId', required: false, type: Number,
    description: 'Gắn file vào một mốc tiến độ; bỏ trống là file của cả đơn',
  })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Tên trường phải là "file"' },
      },
    },
  })
  @ApiResponse({ status: 201, type: FileMetaDto })
  async uploadFile(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Query('milestoneId') milestoneId?: string,
  ): Promise<FileMetaDto> {
    const mp = req as MultipartRequest;
    if (!mp.isMultipart()) throw new BadRequestException('Phải gửi dạng multipart/form-data');
    const part = await mp.file();
    if (!part) throw new BadRequestException('Không có file nào được gửi lên');
    return this.filesService.upload(
      id,
      { filename: part.filename, mimetype: part.mimetype, buffer: await part.toBuffer() },
      user,
      milestoneId ? Number(milestoneId) : undefined,
    );
  }

  @Get('files/:orderId/:fileId')
  @ApiOperation({ summary: 'Tải file — stream có kiểm tra quyền, không phục vụ tĩnh' })
  @ApiResponse({ status: 200 })
  async download(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const { meta, stream } = await this.filesService.download(orderId, fileId, user);
    void res
      .header('Content-Type', meta.mime)
      .header('Content-Length', meta.size)
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      )
      .send(stream);
  }

  @Delete('orders/:id/files/:fileId')
  @ApiOperation({ summary: 'Xóa file — người tải lên hoặc Admin' })
  @ApiResponse({ status: 200 })
  async removeFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.filesService.remove(id, fileId, user);
    return { ok: true };
  }
}
