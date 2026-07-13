import { Body, Controller, Get, Param, Patch, Post, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Public } from "../auth/public.decorator";
import { R2StorageService } from "../storage/r2-storage.service";
import { CompleteAdmissionDto, RequestAdmissionDto, ReviewAdmissionDto } from "./admission.dto";
import { AdmissionService } from "./admission.service";

@Controller("admissions")
export class AdmissionController {
  constructor(private readonly service: AdmissionService, private readonly storage: R2StorageService) {}
  @Public() @Get("catalog") catalog(){return this.service.catalog();}
  @Public() @Post("request") request(@Body() body:RequestAdmissionDto){return this.service.request(body);}
  @Public() @Get("register/:token") byToken(@Param("token") token:string){return this.service.byToken(decodeURIComponent(token));}
  @Public() @Post("complete") complete(@Body() body:CompleteAdmissionDto){return this.service.complete(body);}
  @Public() @Post("documents")
  @UseInterceptors(FileFieldsInterceptor([{name:"profilePhoto",maxCount:1},{name:"studentCnic",maxCount:2},{name:"guardianCnic",maxCount:2},{name:"birthCertificate",maxCount:1},{name:"previousResult",maxCount:5},{name:"otherDocuments",maxCount:5}],{storage:memoryStorage(),limits:{fileSize:15*1024*1024}}))
  async documents(@UploadedFiles() files:Record<string,Express.Multer.File[]>){const uploaded=await Promise.all(Object.entries(files||{}).flatMap(([field,list])=>list.map(async file=>({field,...await this.storage.uploadFile(file,`student-documents/${field}`)}))));return{files:uploaded};}
}

@Controller("admin/admissions")
export class AdminAdmissionController {
  constructor(private readonly service: AdmissionService) {}
  @Get() list(){return this.service.list();}
  @Post(":id/proceed") proceed(@Param("id") id:string){return this.service.proceed(id);}
  @Patch(":id/review") review(@Param("id") id:string,@Body() body:ReviewAdmissionDto){return this.service.review(id,body);}
}
