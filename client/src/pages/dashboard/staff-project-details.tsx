
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, MessageSquare, FileText } from "lucide-react";
import type { Project } from "@db/schema";

export default function StaffProjectDetails() {
  const { id } = useParams();
  const [_, setLocation] = useLocation();

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["api/projects", id],
    queryFn: () => fetch(`/api/projects/${id}`).then(res => res.json())
  });

  if (isLoading || !project) {
    return <div>Loading...</div>;
  }

  const cards = [
    {
      title: "My Tasks",
      icon: ClipboardList,
      description: "View and manage your assigned tasks for this project",
      path: `/dashboard/projects/${id}/staff-tasks`
    },
    {
      title: "Team Chat",
      icon: MessageSquare,
      description: "Communicate with your team members",
      path: `/dashboard/projects/${id}/team-chat`
    },
    {
      title: "Resources",
      icon: FileText,
      description: "Access project documents and files",
      path: `/dashboard/projects/${id}/resources`
    }
  ];

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-muted-foreground">{project.description}</p>
            <div className="mt-2 flex items-center gap-4">
              <div className="text-sm">
                <span className="font-medium">Progress: </span>
                <span>{project.progress || 0}%</span>
              </div>
              <div className="text-sm">
                <span className="font-medium">Status: </span>
                <span className="capitalize">{project.status}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Card 
                  key={card.title}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setLocation(card.path)}
                >
                  <CardHeader className="flex flex-row items-center gap-4">
                    <Icon className="h-6 w-6" />
                    <div>
                      <h3 className="text-lg font-semibold">{card.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {card.description}
                      </p>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
