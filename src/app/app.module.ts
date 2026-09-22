import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthGateComponent } from './components/auth-gate/auth-gate.component';
import { CurriculumOnboardingComponent } from './components/curriculum-onboarding/curriculum-onboarding.component';
import { RoadmapComponent } from './components/roadmap/roadmap.component';
import { MemorizeComponent } from './components/memorize/memorize.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';

@NgModule({
  declarations: [
    AppComponent,
    AuthGateComponent,
    CurriculumOnboardingComponent,
    RoadmapComponent,
    MemorizeComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
