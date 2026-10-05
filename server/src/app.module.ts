import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AccountThrottlerGuard } from "./common/account-throttler.guard";
import { AuthModule } from "./modules/auth/auth.module";
import { ContentModule } from "./modules/content/content.module";
import { QuizModule } from "./modules/quiz/quiz.module";
import { MockExamModule } from "./modules/mock-exam/mock-exam.module";
import { UsersModule } from "./modules/users/user.module";
import { StatsModule } from "./modules/stats/stats.module";
import { ClassesModule } from "./modules/classes/class.module";
import { AdmissionModule } from "./modules/admissions/admission.module";
import { TutorModule } from "./modules/tutor/tutor.module";
import { RecommendationsModule } from "./modules/recommendations/recommendations.module";
import { GuardianModule } from "./modules/guardian/guardian.module";
import { SystemModule } from "./modules/system/system.module";
import { AppController } from "./app.controller";

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]), AuthModule, ContentModule, QuizModule, MockExamModule, UsersModule, StatsModule, ClassesModule, AdmissionModule, TutorModule, RecommendationsModule, GuardianModule, SystemModule],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: AccountThrottlerGuard }],
})
export class AppModule {}
