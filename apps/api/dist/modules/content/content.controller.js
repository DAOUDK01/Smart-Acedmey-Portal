"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherContentController = exports.GuardianProgressController = exports.ContentController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const content_dto_1 = require("./content.dto");
const content_service_1 = require("./content.service");
let ContentController = class ContentController {
    contentService;
    constructor(contentService) {
        this.contentService = contentService;
    }
    listCourses() {
        return this.contentService.listCourses();
    }
    createCourse(body) {
        return this.contentService.createCourse(body);
    }
    updateCourse(id, body) {
        return this.contentService.updateCourse(id, body);
    }
    deleteCourse(id) {
        return this.contentService.deleteCourse(id);
    }
    listLectures() {
        return this.contentService.listLectures();
    }
    createLecture(body) {
        return this.contentService.createLecture(body);
    }
    updateLecture(id, body) {
        return this.contentService.updateLecture(id, body);
    }
    deleteLecture(id) {
        return this.contentService.deleteLecture(id);
    }
    listCheckpoints() {
        return this.contentService.listCheckpoints();
    }
    createCheckpoint(body) {
        return this.contentService.createCheckpoint(body);
    }
    updateCheckpoint(id, body) {
        return this.contentService.updateCheckpoint(id, body);
    }
    deleteCheckpoint(id) {
        return this.contentService.deleteCheckpoint(id);
    }
};
exports.ContentController = ContentController;
__decorate([
    (0, common_1.Get)("courses"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "listCourses", null);
__decorate([
    (0, common_1.Post)("courses"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_dto_1.CreateCourseDto]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "createCourse", null);
__decorate([
    (0, common_1.Patch)("courses/:id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_a = typeof Record !== "undefined" && Record) === "function" ? _a : Object]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "updateCourse", null);
__decorate([
    (0, common_1.Delete)("courses/:id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "deleteCourse", null);
__decorate([
    (0, common_1.Get)("lectures"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "listLectures", null);
__decorate([
    (0, common_1.Post)("lectures"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_dto_1.CreateLectureDto]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "createLecture", null);
__decorate([
    (0, common_1.Patch)("lectures/:id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_b = typeof Record !== "undefined" && Record) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "updateLecture", null);
__decorate([
    (0, common_1.Delete)("lectures/:id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "deleteLecture", null);
__decorate([
    (0, common_1.Get)("checkpoints"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "listCheckpoints", null);
__decorate([
    (0, common_1.Post)("checkpoints"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_dto_1.CreateCheckpointDto]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "createCheckpoint", null);
__decorate([
    (0, common_1.Patch)("checkpoints/:id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_c = typeof Record !== "undefined" && Record) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "updateCheckpoint", null);
__decorate([
    (0, common_1.Delete)("checkpoints/:id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ContentController.prototype, "deleteCheckpoint", null);
exports.ContentController = ContentController = __decorate([
    (0, common_1.Controller)("admin"),
    __metadata("design:paramtypes", [content_service_1.ContentService])
], ContentController);
let GuardianProgressController = class GuardianProgressController {
    contentService;
    constructor(contentService) {
        this.contentService = contentService;
    }
    listProgress() {
        return this.contentService.listProgress();
    }
    createProgress(body) {
        return this.contentService.createProgress(body);
    }
    updateProgress(id, body) {
        return this.contentService.updateProgress(id, body);
    }
    deleteProgress(id) {
        return this.contentService.deleteProgress(id);
    }
};
exports.GuardianProgressController = GuardianProgressController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GuardianProgressController.prototype, "listProgress", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_dto_1.CreateProgressDto]),
    __metadata("design:returntype", void 0)
], GuardianProgressController.prototype, "createProgress", null);
__decorate([
    (0, common_1.Patch)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_d = typeof Record !== "undefined" && Record) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], GuardianProgressController.prototype, "updateProgress", null);
__decorate([
    (0, common_1.Delete)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GuardianProgressController.prototype, "deleteProgress", null);
exports.GuardianProgressController = GuardianProgressController = __decorate([
    (0, common_1.Controller)("guardian/progress"),
    __metadata("design:paramtypes", [content_service_1.ContentService])
], GuardianProgressController);
let TeacherContentController = class TeacherContentController {
    contentService;
    constructor(contentService) {
        this.contentService = contentService;
    }
    async transcribe(body, file) {
        const fallbackTitle = file?.originalname?.replace(/\.[^/.]+$/, "") || "Uploaded lecture";
        const title = body.title?.trim() || fallbackTitle;
        const uploadedUrl = file ? `/uploads/${file.filename}` : undefined;
        const videoUrl = body.videoUrl?.trim() || uploadedUrl || title;
        const transcript = await this.contentService.generateTranscriptForVideo(title, videoUrl);
        return { transcript, videoUrl };
    }
};
exports.TeacherContentController = TeacherContentController;
__decorate([
    (0, common_1.Post)("transcribe"),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)("file", {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                const uploadsPath = (0, path_1.join)(process.cwd(), "apps/api/uploads");
                if (!(0, fs_1.existsSync)(uploadsPath)) {
                    (0, fs_1.mkdirSync)(uploadsPath, { recursive: true });
                }
                cb(null, uploadsPath);
            },
            filename: (_req, file, cb) => {
                const originalName = file.originalname || "video.mp4";
                const extension = originalName.split(".").pop();
                const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
                const sanitizedBase = nameWithoutExt.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
                cb(null, `${Date.now()}-${sanitizedBase}.${extension}`);
            },
        }),
    })),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TeacherContentController.prototype, "transcribe", null);
exports.TeacherContentController = TeacherContentController = __decorate([
    (0, common_1.Controller)("teacher"),
    __metadata("design:paramtypes", [content_service_1.ContentService])
], TeacherContentController);
