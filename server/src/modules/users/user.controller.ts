import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UserService } from "./user.service";
import { CompleteStaffRegistrationDto, CreateUserDto, InviteStaffDto, ReviewStaffInvitationDto, UpdateUserDto } from "./user.dto";
import { Public } from "../auth/public.decorator";
import { R2StorageService } from "../storage/r2-storage.service";

@Controller("admin/users")
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly r2StorageService: R2StorageService,
  ) {}

  @Get()
  listUsers() {
    return this.userService.listUsers();
  }

  @Get("staff-invitations")
  listStaffInvitations() {
    return this.userService.listStaffInvitations();
  }

  @Post("staff-invitations")
  inviteStaff(@Body() body: InviteStaffDto) {
    return this.userService.inviteStaff(body);
  }

  @Public()
  @Get("staff-invitations/token/:token")
  getStaffInvitationByToken(@Param("token") token: string) {
    return this.userService.getStaffInvitationByToken(decodeURIComponent(token));
  }

  @Public()
  @Post("staff-invitations/documents")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "cnicFront", maxCount: 1 },
        { name: "cnicBack", maxCount: 1 },
        { name: "cv", maxCount: 1 },
        { name: "educationalDocuments", maxCount: 10 },
        { name: "experienceLetters", maxCount: 10 },
        { name: "certificates", maxCount: 10 },
        { name: "profilePhoto", maxCount: 1 },
        { name: "otherDocuments", maxCount: 10 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 15 * 1024 * 1024 },
      },
    ),
  )
  async uploadStaffDocuments(@UploadedFiles() files: Record<string, Express.Multer.File[]>) {
    const uploadedFiles = await Promise.all(
      Object.entries(files || {}).flatMap(([field, fieldFiles]) =>
        fieldFiles.map(async (file) => {
          const uploaded = await this.r2StorageService.uploadFile(file, `staff-documents/${field}`);
          return {
            field,
            originalName: uploaded.originalName,
            key: uploaded.key,
            url: uploaded.url,
            contentType: uploaded.contentType,
          };
        }),
      ),
    );

    return { files: uploadedFiles };
  }

  @Public()
  @Post("staff-invitations/complete")
  completeStaffRegistration(@Body() body: CompleteStaffRegistrationDto) {
    return this.userService.completeStaffRegistration(body);
  }

  @Patch("staff-invitations/:id/review")
  reviewStaffInvitation(@Param("id") id: string, @Body() body: ReviewStaffInvitationDto) {
    return this.userService.reviewStaffInvitation(id, body);
  }

  @Get("by-email/:email")
  async getUserByEmail(@Param("email") email: string) {
    const user = await this.userService.getUserByEmail(decodeURIComponent(email));
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  @Get(":id/assigned-courses")
  getStaffAssignedCourses(@Param("id") id: string) {
    return this.userService.getStaffAssignedCourses(id);
  }

  @Get(":id")
  getUser(@Param("id") id: string) {
    return this.userService.getUser(id);
  }

  @Post()
  createUser(@Body() body: CreateUserDto) {
    return this.userService.createUser(body);
  }

  @Patch(":id")
  updateUser(@Param("id") id: string, @Body() body: UpdateUserDto) {
    return this.userService.updateUser(id, body);
  }

  @Delete(":id")
  deleteUser(@Param("id") id: string) {
    return this.userService.deleteUser(id);
  }
}
