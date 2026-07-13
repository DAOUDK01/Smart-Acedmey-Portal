import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ClassService } from "./class.service";
import { AssignClassCourseDto, CreateClassDto, CreateSectionDto, UpdateClassCourseDto, UpdateClassDto, UpdateSectionDto } from "./class.dto";

@Controller("admin/classes")
export class ClassController {
  constructor(private readonly classService: ClassService) {}

  @Get() listClasses() { return this.classService.listClasses(); }
  @Post() createClass(@Body() body: CreateClassDto) { return this.classService.createClass(body); }
  @Patch(":id") updateClass(@Param("id") id: string, @Body() body: UpdateClassDto) { return this.classService.updateClass(id, body); }
  @Delete(":id") deleteClass(@Param("id") id: string) { return this.classService.deleteClass(id); }
  @Post(":classId/sections") createSection(@Param("classId") classId: string, @Body() body: CreateSectionDto) { return this.classService.createSection(classId, body); }
  @Patch("sections/:id") updateSection(@Param("id") id: string, @Body() body: UpdateSectionDto) { return this.classService.updateSection(id, body); }
  @Delete("sections/:id") deleteSection(@Param("id") id: string) { return this.classService.deleteSection(id); }
  @Post("sections/:sectionId/courses") assignCourse(@Param("sectionId") sectionId: string, @Body() body: AssignClassCourseDto) { return this.classService.assignCourse(sectionId, body); }
  @Patch("courses/:id") updateCourseAssignment(@Param("id") id: string, @Body() body: UpdateClassCourseDto) { return this.classService.updateCourseAssignment(id, body); }
  @Delete("courses/:id") removeCourseAssignment(@Param("id") id: string) { return this.classService.removeCourseAssignment(id); }
}
