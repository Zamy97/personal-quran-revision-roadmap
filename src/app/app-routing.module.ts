import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoadmapComponent } from './components/roadmap/roadmap.component';

const routes: Routes = [
  { path: '', component: RoadmapComponent },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
