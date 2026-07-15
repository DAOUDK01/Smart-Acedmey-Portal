import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { ContentModule } from "./modules/content/content.module";
import { QuizModule } from "./modules/quiz/quiz.module";
import { UsersModule } from "./modules/users/user.module";
import { StatsModule } from "./modules/stats/stats.module";
import { ClassesModule } from "./modules/classes/class.module";
import { AdmissionModule } from "./modules/admissions/admission.module";
import { AppController } from "./app.controller";

@Module({
  imports: [AuthModule, ContentModule, QuizModule, UsersModule, StatsModule, ClassesModule, AdmissionModule],
  controllers: [AppController],
})
export class AppModule {}
