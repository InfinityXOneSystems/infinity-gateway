{{- define "background-agent.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "background-agent.fullname" -}}
{{- printf "%s-%s" (include "background-agent.name" .) .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
