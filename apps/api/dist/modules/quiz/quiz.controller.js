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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentQuizController = exports.QuizController = void 0;
const common_1 = require("@nestjs/common");
const quiz_service_1 = require("./quiz.service");
const quiz_dto_1 = require("./quiz.dto");
let QuizController = class QuizController {
    quizService;
    constructor(quizService) {
        this.quizService = quizService;
    }
    listQuizQuestions() {
        return this.quizService.listQuizQuestions();
    }
    getQuizQuestion(id) {
        return this.quizService.getQuizQuestion(id);
    }
    generateQuizQuestions(body) {
        return this.quizService.generateQuizQuestions(body.lectureId, body.topic, body.transcript);
    }
    createQuizQuestion(body) {
        return this.quizService.createQuizQuestion(body);
    }
    updateQuizQuestion(id, body) {
        return this.quizService.updateQuizQuestion(id, body);
    }
    deleteQuizQuestion(id) {
        return this.quizService.deleteQuizQuestion(id);
    }
    listQuizAttempts() {
        return this.quizService.listQuizAttempts();
    }
};
exports.QuizController = QuizController;
__decorate([
    (0, common_1.Get)("questions"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], QuizController.prototype, "listQuizQuestions", null);
__decorate([
    (0, common_1.Get)("questions/:id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], QuizController.prototype, "getQuizQuestion", null);
__decorate([
    (0, common_1.Post)("generate"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QuizController.prototype, "generateQuizQuestions", null);
__decorate([
    (0, common_1.Post)("questions"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [quiz_dto_1.CreateQuizQuestionDto]),
    __metadata("design:returntype", void 0)
], QuizController.prototype, "createQuizQuestion", null);
__decorate([
    (0, common_1.Patch)("questions/:id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, quiz_dto_1.UpdateQuizQuestionDto]),
    __metadata("design:returntype", void 0)
], QuizController.prototype, "updateQuizQuestion", null);
__decorate([
    (0, common_1.Delete)("questions/:id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], QuizController.prototype, "deleteQuizQuestion", null);
__decorate([
    (0, common_1.Get)("attempts"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], QuizController.prototype, "listQuizAttempts", null);
exports.QuizController = QuizController = __decorate([
    (0, common_1.Controller)("admin/quiz"),
    __metadata("design:paramtypes", [quiz_service_1.QuizService])
], QuizController);
let StudentQuizController = class StudentQuizController {
    quizService;
    constructor(quizService) {
        this.quizService = quizService;
    }
    listQuizQuestions() {
        return this.quizService.listQuizQuestions();
    }
    getQuizQuestion(id) {
        return this.quizService.getQuizQuestion(id);
    }
    createQuizAttempt(body) {
        return this.quizService.createQuizAttempt(body);
    }
};
exports.StudentQuizController = StudentQuizController;
__decorate([
    (0, common_1.Get)("questions"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StudentQuizController.prototype, "listQuizQuestions", null);
__decorate([
    (0, common_1.Get)("questions/:id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], StudentQuizController.prototype, "getQuizQuestion", null);
__decorate([
    (0, common_1.Post)("attempts"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [quiz_dto_1.CreateQuizAttemptDto]),
    __metadata("design:returntype", void 0)
], StudentQuizController.prototype, "createQuizAttempt", null);
exports.StudentQuizController = StudentQuizController = __decorate([
    (0, common_1.Controller)("student/quiz"),
    __metadata("design:paramtypes", [quiz_service_1.QuizService])
], StudentQuizController);
